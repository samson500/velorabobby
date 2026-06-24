exports.handler = async function (event, context) {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
    }

    let body;
    try { body = JSON.parse(event.body || "{}"); } catch (_) {
        return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
    }

    const { reference, firstName, lastName, email, phone, webhookUrl } = body;

    if (!reference || !firstName || !email || !phone) {
        return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields" }) };
    }

    const secret = process.env.ASPFIY_SECRET_KEY;
    if (!secret) {
        return { statusCode: 500, body: JSON.stringify({ error: "Payment provider not configured" }) };
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
            return { statusCode: 502, body: JSON.stringify({ error: data?.message || "Failed to create payment account" }) };
        }

        return { statusCode: 200, body: JSON.stringify(data) };
    } catch (err) {
        console.error("Aspfiy reserve error:", err);
        return { statusCode: 500, body: JSON.stringify({ error: "Payment provider unavailable" }) };
    }
};
