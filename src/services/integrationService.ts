// Integration service to dispatch to webhooks
export const dispatchToWebhook = async (webhookUrl: string, lead: any) => {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "new_lead",
        source: "jungler_mock",
        data: lead
      })
    });
    
    if (!response.ok) {
      console.error(`Webhook failed with status: ${response.status}`);
    } else {
      console.log(`Successfully dispatched lead ${lead.name} to webhook`);
    }
  } catch (error) {
    console.error(`Error dispatching to webhook ${webhookUrl}:`, error);
  }
};
