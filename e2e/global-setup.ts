/** Fail fast, with the fix, if the backend is not running with data loaded. */
export default async function globalSetup() {
  const api = process.env.API_URL ?? 'http://127.0.0.1:8000';
  const hint = 'Start the stack and load the data first:  make up && make seed';
  let response: Response;
  try {
    response = await fetch(`${api}/api/health/`);
  } catch {
    throw new Error(`The API at ${api} is not reachable. ${hint}`);
  }
  if (!response.ok) throw new Error(`The API at ${api} is unhealthy (${response.status}). ${hint}`);
  const worlds = (await (await fetch(`${api}/api/worlds/`)).json()) as unknown[];
  if (worlds.length < 33) throw new Error(`The API has ${worlds.length} worlds, expected 33. ${hint}`);
}
