// The paywall switch. Off (the default, open beta): every listener gets everything,
// as if on horizonnn. On: plans limit features. Flip it with the worker var PAYWALL = "on".
// The owner's Plan tester record (src 'owner') is honoured either way, so plans can be felt before launch.
export function paywallOn(env) {
  return String((env && env.PAYWALL) || '').trim().toLowerCase() === 'on';
}
