const crypto = require("crypto");
const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

if (!getApps().length) {
    initializeApp({
        credential: cert({
            projectId:   process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n")
        })
    });
}

const db = getFirestore();

function verifySignature(signature, secret) {
    const expected = crypto.createHash("md5").update(secret).digest("hex");
    return signature === expected;
}

exports.handler = async function (event, context) {
    if (event.httpMethod === "OPTIONS") return { statusCode: 200, body: "" };
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
    }

    const signature = event.headers["x-wiaxy-signature"] || "";
    const secret    = process.env.ASPFIY_SECRET_KEY || "";

    if (secret && !verifySignature(signature, secret)) {
        return { statusCode: 401, body: JSON.stringify({ error: "Invalid signature" }) };
    }

    let body;
    try { body = JSON.parse(event.body || "{}"); } catch (_) { body = {}; }

    const reference = body.reference || body.data?.reference || "";
    const amount    = body.amount    || body.data?.amount    || 0;
    const status    = (body.status   || body.data?.status    || "").toLowerCase();

    if ((status !== "success" && status !== "successful") || !reference) {
        return { statusCode: 200, body: JSON.stringify({ received: true }) };
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

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
