// Signal de présence envoyé au lanceur : il s'arrête de lui-même quand la dernière fenêtre se ferme.
// Sans lanceur (serveur de développement seul), l'échec est silencieux.

export function signalerPresence(): void {
  const id = crypto.randomUUID();
  const battre = () => fetch(`/api/battement?page=${id}`, { method: "POST", keepalive: true }).catch(() => undefined);
  battre();
  setInterval(battre, 15_000);
  // Fermeture ou rechargement de la page : « départ » ; un rechargement renvoie aussitôt un battement
  addEventListener("pagehide", () => navigator.sendBeacon(`/api/battement?page=${id}&depart=1`));
}
