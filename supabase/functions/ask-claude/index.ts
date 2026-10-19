// Ask Claude instant replies: switched off (Graham removed the floating panel, 2026-10-19).
// Questions go through the claude_requests queue instead (src/askClaude.js).
Deno.serve(() => new Response(JSON.stringify({ error: "gone" }), { status: 410, headers: { "Content-Type": "application/json" } }));
