#!/bin/bash
# Claude Code Status Line — NF + powerline arrows; model+effort, pwd(repo+subdir), git, +lines, context, cost.
RESET='\033[0m'
BOLD_WHITE='\033[1;37m'; BOLD_YELLOW='\033[1;33m'; BOLD_BLUE='\033[1;34m'
BOLD_GREEN='\033[1;32m'; BOLD_RED='\033[1;31m'; BOLD_BLACK='\033[1;30m'
GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; PURPLE='\033[0;35m'

input=$(cat)
IFS=$'\t' read -r MODEL_ID MODEL_NAME CURRENT_DIR LINES_ADDED LINES_REMOVED API_DUR_MS DUR_MS COST PCT CTX_SIZE EFFORT REPO_OWNER REPO_NAME <<< "$(
  jq -r '[
    (.model.id // ""),(.model.display_name // "unknown"),
    (.workspace.current_dir // .cwd // ""),
    (.cost.total_lines_added // 0),(.cost.total_lines_removed // 0),
    (.cost.total_api_duration_ms // 0),(.cost.total_duration_ms // 0),
    (.cost.total_cost_usd // 0),
    (.context_window.used_percentage // 0),(.context_window.context_window_size // 0),
    (.effort.level // ""),
    (.workspace.repo.owner // ""),(.workspace.repo.name // "")
  ] | @tsv' <<< "$input"
)"
API_DUR=$(( ${API_DUR_MS:-0} / 1000 )); DUR=$(( ${DUR_MS:-0} / 1000 ))
COST_FMT=$(printf '%.3f' "${COST:-0}"); PCT_INT=$(printf '%.0f' "${PCT:-0}")
CTX_SIZE=${CTX_SIZE:-0}; COLS=${COLUMNS:-0}
SEP="  "

# location: owner/repo + subdir (or ~-abbreviated pwd outside a repo); truncated when narrow
if [ -n "$REPO_OWNER" ] && [ -n "$REPO_NAME" ]; then
  REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
  REL="${CURRENT_DIR#$REPO_ROOT}"; REL="${REL#/}"
  if [ -n "$REL" ]; then
    (( COLS > 0 && COLS < 110 )) && REL="…/${REL##*/}"
    LOC="${BOLD_BLACK}${REPO_OWNER}/${RESET}${BOLD_YELLOW}${REPO_NAME}${RESET}${BOLD_BLACK}/${REL}${RESET}"
  else
    LOC="${BOLD_BLACK}${REPO_OWNER}/${RESET}${BOLD_YELLOW}${REPO_NAME}${RESET}"
  fi
else
  P="${CURRENT_DIR/#$HOME/\~}"
  (( COLS > 0 && COLS < 110 )) && P="…/${P##*/}"
  LOC="${BOLD_YELLOW}${P}${RESET}"
fi

case "$MODEL_ID" in
  *opus*|glm-5.2*)   MC=$BOLD_GREEN ;;
  *haiku*)           MC=$BOLD_YELLOW ;;
  *sonnet*|glm-5.1*) MC=$BOLD_BLUE ;;
  *)                 MC=$BOLD_WHITE ;;
esac
if [[ "$MODEL_ID" == claude-* ]]; then ICON="🤖"; else ICON="⚡"; fi

case "$EFFORT" in
  max|xhigh) EC=$BOLD_RED ;; high) EC=$BOLD_YELLOW ;;
  medium) EC=$GREEN ;; low) EC=$BOLD_BLACK ;; *) EC="" ;;
esac
ETAG=""; [ -n "$EC" ] && ETAG=" ${BOLD_BLACK}·${RESET}${EC}${EFFORT}${RESET}"

GIT_PART=""
if STATUS=$(git status -b --porcelain 2>/dev/null); then
  LINE1="${STATUS%%$'\n'*}"
  BRANCH="${LINE1#\#\# }"; BRANCH="${BRANCH%%...*}"; BRANCH="${BRANCH%% *}"
  if [[ "$BRANCH" == "HEAD" || -z "$BRANCH" ]]; then BRANCH="$(git rev-parse --short HEAD 2>/dev/null)"; fi
  if (( COLS > 0 && COLS < 110 && ${#BRANCH} > 16 )); then BRANCH="…${BRANCH: -15}"; fi
  AHEAD=""; BEHIND=""
  re_a='ahead ([0-9]+)'; re_b='behind ([0-9]+)'
  [[ "$LINE1" =~ $re_a ]] && AHEAD="${BASH_REMATCH[1]}"
  [[ "$LINE1" =~ $re_b ]] && BEHIND="${BASH_REMATCH[1]}"
  REST="${STATUS#*$'\n'}"
  DIRTY=""; [ "$REST" != "$STATUS" ] && [ -n "$REST" ] && DIRTY="${BOLD_RED}✱${RESET}"
  AB=""; [ -n "$AHEAD" ] && AB+=" ${BOLD_GREEN}↑${AHEAD}${RESET}"
  [ -n "$BEHIND" ] && AB+=" ${BOLD_RED}↓${BEHIND}${RESET}"
  [ -n "$BRANCH" ] && GIT_PART="${SEP} ${BOLD_BLUE}${BRANCH}${RESET}${DIRTY}${AB}"
fi

CHG=""
if (( ${LINES_ADDED:-0} > 0 || ${LINES_REMOVED:-0} > 0 )); then
  CHG="${SEP}${BOLD_GREEN}+${LINES_ADDED}${RESET} ${BOLD_RED}-${LINES_REMOVED}${RESET}"
fi

if   ((PCT_INT >= 80)); then CC=$RED; elif ((PCT_INT >= 50)); then CC=$YELLOW; else CC=$GREEN; fi
filled=$((PCT_INT / 20)); ((filled > 5)) && filled=5
bar=""; i=0
while ((i < filled)); do bar+="█"; ((i++)); done
while ((i < 5));       do bar+="░"; ((i++)); done
TAG=""; ((CTX_SIZE >= 1000000)) && TAG="∞"
CTX_PART="${SEP} "
(( COLS <= 0 || COLS >= 110 )) && CTX_PART+="${CC}${bar}${RESET} "
CTX_PART+="${CC}${PCT_INT}%${RESET}"; [ -n "$TAG" ] && CTX_PART+="${CC}${TAG}${RESET}"

DUR_PART="${SEP} ${GREEN}${API_DUR}${RESET}/${PURPLE}${DUR}${RESET}s"
COST_PART="${SEP}${GREEN}${COST_FMT}${RESET}"
((COLS > 0 && COLS < 110)) && { DUR_PART=""; COST_PART=""; }

OUTPUT="${RESET}${ICON} [ ${MC}${MODEL_NAME}${RESET}${ETAG} ]  ${LOC}${GIT_PART}${CHG}${CTX_PART}${DUR_PART}${COST_PART} ${ICON}"
printf '%b\n' "$OUTPUT"
