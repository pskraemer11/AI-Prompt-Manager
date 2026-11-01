#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# hooks-testrun.sh — Verhaltensproben fuer .githooks/pre-push, ohne echtes Push.
#
# Aufruf aus dem Projektordner (Git-Bash):
#   bash scripts/hooks-testrun.sh
#
# Die Werte-Zeile wird von Hand uebergeben, so wie git sie beim Hochladen
# an den Hook schicken wuerde. Nur Lesen: der Git-Stand bleibt unangetastet.
# Alle fuenf Proben muessen in der Erwartung liegen; ein Fehltritt quittiert
# mit Abgang 1.
# ---------------------------------------------------------------------------
set -u

# Der Harness prueft Privacy- und Secret-Regeln, nicht die Tests. Ohne diesen
# Schalter wuerde das Test-Gate in pre-push bei jeder Probe die Suite starten.
export GITHOOKS_TEST_GATE=0

zero='0000000000000000000000000000000000000000'
sha=$(git rev-parse HEAD)
hook='.githooks/pre-push'
fehler=0

if [ ! -f "$hook" ]; then
  echo "testrun: Hook nicht gefunden ($hook) — aus dem Projektordner aufrufen." >&2
  exit 1
fi

probe() {
  _nr=$1
  _erwartung=$2
  _tatsaechlich=$3
  if [ "$_tatsaechlich" = "$_erwartung" ]; then
    echo "probe $_nr: bestanden (Abgang $_tatsaechlich)"
  else
    echo "probe $_nr: Fehltritt (erwartet Abgang $_erwartung, erhalten $_tatsaechlich)" >&2
    fehler=1
  fi
}

# Probe 1: sauberes Zeilenende (wie echtes git push) — Durchgang erwartet.
printf 'refs/heads/main %s refs/heads/main %s\n' "$sha" "$zero" \
  | bash "$hook" >/dev/null 2>&1
probe 1 0 $?

# Probe 2: Windows-Zeilenende (CR-Endrest) — nach Umbau ebenfalls Durchgang.
printf 'refs/heads/main %s refs/heads/main %s\r\n' "$sha" "$zero" \
  | bash "$hook" >/dev/null 2>&1
probe 2 0 $?

# Probe 3: Fernwert unlesbar (Text statt Revision) — Block erwartet; die
# Sperrmeldung des Hooks sichtbar lassen.
printf 'refs/heads/main %s refs/heads/main nicht40hex\n' "$sha" \
  | bash "$hook"
probe 3 1 $?

# Probe 4: Fernwert zu kurz (Hex-Folge unzureichend) — Block erwartet.
printf 'refs/heads/main %s refs/heads/main aaaa\n' "$sha" \
  | bash "$hook"
probe 4 1 $?

# Probe 5: gitleaks nicht auffindbar — Block erwartet (fail closed).
tmp_home=$(mktemp -d)
tmp_local=$(mktemp -d)
printf 'refs/heads/main %s refs/heads/main %s\n' "$sha" "$zero" \
  | HOME="$tmp_home" LOCALAPPDATA="$tmp_local" GITLEAKS_BIN="gitleaks-definitely-missing" bash "$hook"
probe 5 1 $?
rm -rf "$tmp_home" "$tmp_local"

if [ "$fehler" -eq 0 ]; then
  echo "testrun: 5/5 bestanden"
else
  echo "testrun: FEHLER — siehe Fehltritte oben" >&2
fi
exit "$fehler"
