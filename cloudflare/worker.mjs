// Deliberate deployment guard: authentication and persistence adapters are not wired.
// Do not serve static or private assets before verified owner authentication.
export default {
  async fetch(){return new Response('Cloud deployment is not configured. Use the local mock app.',{status:503,headers:{'Cache-Control':'no-store'}})},
  async queue(){throw new Error('Paid queue processing disabled; no provider request was sent')}
};
