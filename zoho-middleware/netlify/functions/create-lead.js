// Use 'node-fetch' to make HTTP requests in a Node.js environment
const fetch = require('node-fetch');

// The main function that Netlify will run when the endpoint is called
exports.handler = async function(event, context) {
    // --- Security Check ---
    // This ensures that the function can only be called via a POST request.
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: 'Method Not Allowed' }),
        };
    }

    // --- Retrieve Secure Credentials ---
    // These are your Zoho secrets, which you will set up in the Netlify UI.
    // NEVER write your actual secrets in the code.
    const { ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_API_DOMAIN } = process.env;

    // --- Get Lead Data from the Request ---
    // The other application will send the phone number in the request body.
    let requestBody;
    try {
        requestBody = JSON.parse(event.body);
    } catch (error) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Invalid JSON format in request body.' }) };
    }

    const leadPhoneNumber = requestBody.phone;
    if (!leadPhoneNumber) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Missing "phone" in request body.' }) };
    }

    // --- 1. Get a Fresh Access Token from Zoho ---
    const accountsDomain = getAccountsDomain(ZOHO_API_DOMAIN);
    const tokenUrl = `${accountsDomain}/oauth/v2/token`;
    const tokenParams = new URLSearchParams();
    tokenParams.append('refresh_token', ZOHO_REFRESH_TOKEN);
    tokenParams.append('client_id', ZOHO_CLIENT_ID);
    tokenParams.append('client_secret', ZOHO_CLIENT_SECRET);
    tokenParams.append('grant_type', 'refresh_token');

    let accessToken;
    try {
        const tokenResponse = await fetch(tokenUrl, { method: 'POST', body: tokenParams });
        const tokenData = await tokenResponse.json();
        if (!tokenData.access_token) {
            throw new Error(tokenData.error || 'Failed to get access token.');
        }
        accessToken = tokenData.access_token;
    } catch (error) {
        console.error('Token Refresh Error:', error);
        return { statusCode: 500, body: JSON.stringify({ message: 'Could not refresh Zoho token.', details: error.message }) };
    }

    // --- 2. Post the Lead to Zoho CRM ---
    const leadUrl = `${ZOHO_API_DOMAIN}/crm/v2/Leads`;
    const leadPayload = {
        data: [{
            Last_Name: "BBC New Lead",
            Phone: leadPhoneNumber,
        }, ],
    };

    try {
        const leadResponse = await fetch(leadUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(leadPayload),
        });

        const leadResult = await leadResponse.json();

        if (leadResult.data && leadResult.data[0].status === 'success') {
            // Success!
            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: 'Lead created successfully!',
                    zoho_lead_id: leadResult.data[0].details.id,
                }),
            };
        } else {
            // Zoho returned an error
            throw new Error(JSON.stringify(leadResult));
        }
    } catch (error) {
        console.error('Lead Creation Error:', error);
        return { statusCode: 500, body: JSON.stringify({ message: 'Failed to post lead to Zoho.', details: error.message }) };
    }
};

// Helper function to determine the correct accounts domain
function getAccountsDomain(apiDomain) {
    if (!apiDomain) return 'https://accounts.zoho.com';
    if (apiDomain.includes('.eu')) return 'https://accounts.zoho.eu';
    if (apiDomain.includes('.in')) return 'https://accounts.zoho.in';
    if (apiDomain.includes('.com.au')) return 'https://accounts.zoho.com.au';
    if (apiDomain.includes('.jp')) return 'https://accounts.zoho.jp';
    if (apiDomain.includes('.sa')) return 'https://accounts.zoho.sa';
    return 'https://accounts.zoho.com';
}
