const fetch = require('node-fetch');

class USPSClient {
  constructor() {
    this.clientId = process.env.USPS_CLIENT_ID;
    this.clientSecret = process.env.USPS_CLIENT_SECRET;
    this.baseUrl = 'https://apis.usps.com';
    this._accessToken = null;
    this._tokenExpiry = null;
  }

  async getAccessToken() {
    if (this._accessToken && this._tokenExpiry && Date.now() < this._tokenExpiry) {
      return this._accessToken;
    }
    const response = await fetch(`${this.baseUrl}/oauth2/v3/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret
      }).toString()
    });
    if (!response.ok) {
      throw new Error(`USPS OAuth error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    this._accessToken = data.access_token;
    this._tokenExpiry = Date.now() + ((data.expires_in || 3600) - 60) * 1000;
    return this._accessToken;
  }

  isPreShipment(trackingEvents) {
    if (!trackingEvents || trackingEvents.length === 0) return true;
    const type = (trackingEvents[0].eventType || trackingEvents[0].name || '').toLowerCase();
    return (
      type.includes('pre-shipment') ||
      type.includes('pre_shipment') ||
      type.includes('awaiting') ||
      type.includes('label created') ||
      type.includes('info sent')
    );
  }

  async getTrackingStatus(trackingNumber, token) {
    try {
      const response = await fetch(
        `${this.baseUrl}/tracking/v3/tracking/${encodeURIComponent(trackingNumber)}?expand=SUMMARY`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (!response.ok) {
        return { trackingNumber, status: 'Error', eventTimestamp: null, eventCity: null, eventState: null, isPreShipment: false, error: true };
      }
      const data = await response.json();
      const events = data.trackingEvents || [];
      const latest = events[0] || null;
      return {
        trackingNumber,
        status: latest?.eventType || latest?.name || 'Pre-Shipment',
        eventTimestamp: latest?.eventTimestamp || null,
        eventCity: latest?.eventCity || null,
        eventState: latest?.eventState || null,
        isPreShipment: this.isPreShipment(events),
        error: false
      };
    } catch (err) {
      return { trackingNumber, status: 'Error', eventTimestamp: null, eventCity: null, eventState: null, isPreShipment: false, error: true };
    }
  }

  async getTrackingStatuses(trackingNumbers) {
    const token = await this.getAccessToken();
    const results = {};
    const BATCH_SIZE = 20;

    for (let i = 0; i < trackingNumbers.length; i += BATCH_SIZE) {
      const batch = trackingNumbers.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(tn => this.getTrackingStatus(tn, token)));
      batchResults.forEach(r => { results[r.trackingNumber] = r; });
    }

    return results;
  }
}

module.exports = USPSClient;
