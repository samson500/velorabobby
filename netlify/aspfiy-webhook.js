import crypto from "node:crypto";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore }                  from "firebase-admin/firestore";

if (!getApps().length) {
    initializeApp({
        credential: cert({
            projectId:   Netlify.env.get("FIREBASE_PROJECT_ID"),
            clientEmail: Netlify.env.get("FIREBASE_CLIENT_EMAIL"),
            privateKey:  Netlify.env.get("FIREBASE_PRIVATE_KEY")?.replace(/\\n/g, "\n")
        })
    });
}

const db = getFirestore();

function verifySignature(signature, secret) {
    const expected = crypto.createHash("md5").update(secret).digest("hex");
    return signature === expected;
}

export default async (req, context) => {
    if (req.method === "OPTIONS") return new Response("", { status: 200 });
    if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
    }

    const signature = req.headers.get("x-wiaxy-signature") || "";
    const secret    = Netlify.env.get("ASPFIY_SECRET_KEY") || "";

    if (secret && !verifySignature(signature, secret)) {
        return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401 });
    }

    let body;
    try { body = await req.json(); } catch (_) { body = {}; }

    const reference = body.reference || body.data?.reference || "";
    const amount    = body.amount    || body.data?.amount    || 0;
    const status    = (body.status   || body.data?.status    || "").toLowerCase();

    if ((status !== "success" && status !== "successful") || !reference) {
        return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    try {
        const snap = await db.collection("velorausers")
            .where("aspfiyReference", "==", reference)
            .limit(1)
            .get();

        if (!snap.empty) {
            await snap.docs[0].ref.update({
                activated:       true,
                activatedAt:     new Date().toISOString(),
                aspfiyReference: reference,
                paidAmount:      String(amount)
            });
        }
    } catch (err) {
        console.error("Firestore update failed:", err);
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
};

export const config = { path: "/.netlify/functions/aspfiy-webhook" };
