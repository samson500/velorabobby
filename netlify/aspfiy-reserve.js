export default async (req, context) => {
    if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
    }

    let body;
    try { body = await req.json(); } catch (_) {
        return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
    }

    const { reference, firstName, lastName, email, phone, webhookUrl } = body || {};

    if (!reference || !firstName || !email || !phone) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
    }

    const secret = Netlify.env.get("ASPFIY_SECRET_KEY");
    if (!secret) {
        return new Response(JSON.stringify({ error: "Payment provider not configured" }), { status: 500 });
    }

    try {
        const response = await fetch("https://api-v1.aspfiy.com/reserve-paga/", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${secret}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                reference,
                firstName,
                lastName:   lastName || firstName,
                email,
                phone,
                webhookUrl: webhookUrl || "https://veloraofficialai.netlify.app/.netlify/functions/aspfiy-webhook"
            })
        });

        const data = await response.json();

        if (!response.ok) {
            return new Response(JSON.stringify({ error: data?.message || "Failed to create payment account" }), { status: 502 });
        }

        return new Response(JSON.stringify(data), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });
    } catch (err) {
        console.error("Aspfiy reserve error:", err);
        return new Response(JSON.stringify({ error: "Payment provider unavailable" }), { status: 500 });
    }
};

export const config = { path: "/.netlify/functions/aspfiy-reserve" };
