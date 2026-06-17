const j = (url) => fetch(url).then((r) => r.json());

export const getPools = () => j("/api/pools");
export const getStandings = (poolId) => j(`/api/pools/${poolId}/standings`);
export const getGrid = (poolId) => j(`/api/pools/${poolId}/grid`);
export const getMatches = () => j("/api/matches");

export async function checkAdmin(token) {
  const r = await fetch("/api/admin/check", {
    headers: { "x-admin-token": token },
  });
  return r.ok;
}

export async function savePrediction(token, { pool_match_id, player_id, pred_home, pred_away }) {
  const r = await fetch("/api/admin/predictions", {
    method: "PUT",
    headers: { "content-type": "application/json", "x-admin-token": token },
    body: JSON.stringify({ pool_match_id, player_id, pred_home, pred_away }),
  });
  if (!r.ok) throw new Error((await r.json()).error || "save failed");
  return r.json();
}

export const getAnnouncements = () => j("/api/announcements");

export async function postAnnouncement(token, message) {
  const r = await fetch("/api/admin/announcements", {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-token": token },
    body: JSON.stringify({ message }),
  });
  if (!r.ok) throw new Error((await r.json()).error || "post failed");
  return r.json();
}

export async function deleteAnnouncement(token, id) {
  const r = await fetch(`/api/admin/announcements/${id}`, {
    method: "DELETE",
    headers: { "x-admin-token": token },
  });
  if (!r.ok) throw new Error((await r.json()).error || "delete failed");
  return r.json();
}

export async function getSettings(token) {
  const r = await fetch("/api/admin/settings", {
    headers: { "x-admin-token": token },
  });
  if (!r.ok) throw new Error((await r.json()).error || "fetch failed");
  return r.json();
}

export async function saveSettings(token, body) {
  const r = await fetch("/api/admin/settings", {
    method: "PUT",
    headers: { "content-type": "application/json", "x-admin-token": token },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.json()).error || "save failed");
  return r.json();
}

export async function adminRefresh(token) {
  const r = await fetch("/api/admin/refresh", {
    method: "POST",
    headers: { "x-admin-token": token },
  });
  if (!r.ok) throw new Error((await r.json()).error || "refresh failed");
  return r.json();
}
