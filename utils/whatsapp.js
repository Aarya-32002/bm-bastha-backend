const twilioSid = process.env.TWILIO_ACCOUNT_SID;
const twilioToken = process.env.TWILIO_AUTH_TOKEN;
const twilioFrom = process.env.TWILIO_WHATSAPP_FROM; // e.g. 'whatsapp:+1415XXXXXXX'

let client = null;
if (twilioSid && twilioToken) {
  try {
    // Lazy require so app doesn't crash if not used
    const Twilio = require('twilio');
    client = new Twilio(twilioSid, twilioToken);
  } catch (e) {
    console.warn('Twilio module not available, WhatsApp messages disabled');
  }
}

async function sendWhatsApp(toNumber, message) {
  if (!client || !twilioFrom) {
    console.log('WhatsApp send skipped (Twilio not configured). To:', toNumber, 'Message:', message);
    return false;
  }

  try {
    const res = await client.messages.create({
      from: twilioFrom, // must be in format 'whatsapp:+1415XXXXXXX'
      to: `whatsapp:${toNumber}`,
      body: message,
    });
    console.log('WhatsApp message sent', res.sid);
    return true;
  } catch (err) {
    console.error('Failed to send WhatsApp message', err);
    return false;
  }
}

module.exports = { sendWhatsApp };
