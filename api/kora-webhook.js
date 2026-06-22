import crypto from "node:crypto";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore }                  from "firebase-admin/firestore";

// Initialise Firebase Admin once across warm invocations
if (!getApps().length) {
    initializeApp({
        credential: cert({
            projectId:   process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            // Vercel stores multiline values fine; newlines are escaped in the env var
            privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n")
        })
    });
}

const db = getFirestore();

function verifyKoraSignature(rawBody, signatureHeader, secret) {
    const expected = crypto
        .createHmac("sha256", secret)
        .update(rawBody)
        .digest("hex");
    return crypto.timingSafeEqual(
        Buffer.from(expected, "hex"),
        Buffer.from(signatureHeader || "", "hex")
    );
}

export default async function handler(req, res) {
    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const signature = req.headers["x-korapay-signature"] || "";
    const secret    = process.env.KORA_WEBHOOK_SECRET || "";

    // Vercel gives us the parsed body — re-serialise to verify the signature
    const rawBody = JSON.stringify(req.body);

    if (secret && !verifyKoraSignature(rawBody, signature, secret)) {
        return res.status(401).json({ error: "Invalid signature" });
    }

    const { event, data } = req.body || {};

    if (event === "charge.success") {
        const { customer, reference, status } = data || {};

        if (status !== "success" || !customer?.email) {
            return res.status(200).json({ received: true });
        }

        try {
            const email   = customer.email.toLowerCase();
            const userRef = db.collection("users").doc(email);
            const snap    = await userRef.get();

            if (snap.exists()) {
                await userRef.update({
                    activated:     true,
                    activatedAt:   new Date().toISOString(),
                    koraReference: reference || null
                });
            }
        } catch (err) {
            console.error("Firestore update failed:", err);
            // Still return 200 so Kora doesn't retry endlessly
        }
    }

    return res.status(200).json({ received: true });
}
