// Pages uses the private Worker service binding; credentials never reach the browser.
export async function onRequest(context) {
  if (!context.env.PARTIVA_API) {
    return Response.json(
      { error: "Backend seguro ainda não configurado." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return context.env.PARTIVA_API.fetch(context.request);
}
