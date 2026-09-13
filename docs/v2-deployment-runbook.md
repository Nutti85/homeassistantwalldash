# V2 deployment runbook

Bruk denne prosedyren for endringer på `codex/dashboard-prototype-v2`. Den holder
V1-stacken urørt og gjør det tydelig hvor en feil oppstår.

## 1. Verifiser arbeidskopien

Kjør fra `C:\Code\Homeassistant WallDash`:

```powershell
git branch --show-current
git status --short
npm.cmd test
npm.cmd run build
git diff --check
```

Bekreft at branchen er `codex/dashboard-prototype-v2`. Stage bare filer som
tilhører endringen; ikke ta med eksisterende, urelaterte arbeidskopiendringer.

## 2. Commit og push

```powershell
git add -- <fil1> <fil2>
git commit -m "Kort beskrivelse av endringen"
git push origin codex/dashboard-prototype-v2
```

Hvis Git rapporterer `index.lock`, kontroller først at ingen Git-prosess kjører
og at `.git\index.lock` ikke er en aktiv lock. Hvis `.git` ikke er skrivbar, må
commit/push kjøres i et miljø med Git-skrivetilgang. Hvis push feiler med
autentisering, logg inn/konfigurer GitHub-credential helper og kjør push på nytt;
ikke deploy en commit som ikke finnes på `origin`.

## 3. Restart riktig Portainer-stack

Før mutasjon skal Portainer-miljø og stack listes på nytt. Velg kun stacken
`homeassistant-wall-dashboard-v2`; V1-stackens navn er
`homeassistant-wall-dashboard` og skal aldri endres i denne prosedyren.

I Portainer:

1. Åpne det rediscoverede miljøet og stacken `homeassistant-wall-dashboard-v2`.
2. Kontroller at repository/branch peker på `origin` og
   `codex/dashboard-prototype-v2`.
3. Stopp stacken og start den igjen. Ikke rediger eller erstatt eksisterende
   miljøvariabler, spesielt `HA_URL` og `HA_TOKEN`.
4. Vent til containeren er `healthy`/`running`.

## 4. Verifiser deploy

```powershell
Invoke-WebRequest http://192.168.1.50:3200/health -UseBasicParsing
Invoke-WebRequest http://192.168.1.50:3200/ -UseBasicParsing
```

Kontroller deretter dashboardet i nettleseren. For tidslinjen skal
`binary_sensor.ringeklokke_visitor` med state `on` vises som «Noen ringte på».

## Feilsøking

- Test/build-feil: ikke commit eller deploy; rett feilen og kjør hele verifiseringen
  på nytt.
- Git-skrivetilgang eller GitHub-autentisering: stopp før deploy og løs dette
  først.
- Portainer viser feil branch eller feil stack: stopp og rediscover; ikke gjett
  ID-er eller restart V1.
- Healthcheck feiler etter restart: inspiser containerlogg og miljøvariabler før
  ny restart.
