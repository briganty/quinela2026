const j = (url) => fetch(url).then((r) => r.json());

export const getPools = () => j("/api/pools");
export const getStandings = (poolId) => j(`/api/pools/${poolId}/standings`);
export const getGrid = (poolId) => j(`/api/pools/${poolId}/grid`);
export const getMatches = () => j("/api/matches");
