import "@fontsource-variable/fraunces";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/400-italic.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./style.css";
import { Application } from "./application";

const application = new Application();
// Point d'accès pour le test automatique des clics (tests/clic.mjs)
(window as unknown as { __atlas: Application }).__atlas = application;
application.demarrer();
