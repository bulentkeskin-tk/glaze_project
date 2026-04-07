Deno.serve(() =>
  new Response(JSON.stringify({ name: 'Glaze', version: '1.0' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
);
