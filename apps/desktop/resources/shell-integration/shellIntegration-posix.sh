# ---------------------------------------------------------------------------
# Tinder Compiler — POSIX shell integration (bash & zsh)
#
# Adapted from VS Code shell integration scripts (MIT License).
# Sources:
#   src/vs/workbench/contrib/terminal/common/scripts/shellIntegration-bash.sh
#   src/vs/workbench/contrib/terminal/common/scripts/shellIntegration-rc.zsh
#
# Emits OSC 633 sequences (see shellIntegration.ps1 header).
# ---------------------------------------------------------------------------

if [ "$TINDER_SHELL_INTEGRATION_INJECTED" = "1" ]; then
    return 0 2>/dev/null || exit 0
fi
export TINDER_SHELL_INTEGRATION_INJECTED=1

# Skip non-interactive shells.
case $- in
    *i*) ;;
    *) return 0 2>/dev/null || exit 0 ;;
esac

__tinder_in_zsh=0
__tinder_in_bash=0
if [ -n "$ZSH_VERSION" ]; then
    __tinder_in_zsh=1
elif [ -n "$BASH_VERSION" ]; then
    __tinder_in_bash=1
else
    return 0 2>/dev/null || exit 0
fi

__tinder_escape_value() {
    # Replace non-printable / problematic chars with \xNN.
    builtin local LC_ALL=C
    builtin local in="$1"
    builtin local out=""
    builtin local i ch code
    for (( i=0; i<${#in}; i++ )); do
        ch=${in:$i:1}
        code=$(printf '%d' "'$ch")
        if [ "$code" -lt 32 ] || [ "$code" -eq 59 ] || [ "$code" -eq 92 ] || [ "$code" -gt 126 ]; then
            out+=$(printf '\\x%02x' "$code")
        else
            out+="$ch"
        fi
    done
    printf '%s' "$out"
}

# OSC 633 emitters — printf to stdout.
__tinder_osc_a() { printf '\e]633;A\a'; }
__tinder_osc_b() { printf '\e]633;B\a'; }
__tinder_osc_c() { printf '\e]633;C\a'; }
__tinder_osc_d() { printf '\e]633;D;%s\a' "$1"; }
__tinder_osc_e() { printf '\e]633;E;%s\a' "$(__tinder_escape_value "$1")"; }
__tinder_osc_p_cwd() { printf '\e]633;P;Cwd=%s\a' "$(__tinder_escape_value "$PWD")"; }

if [ "$__tinder_in_bash" = "1" ]; then
    __tinder_prompt_start() {
        __TINDER_LAST_EXIT=$?
        __tinder_osc_d "$__TINDER_LAST_EXIT"
        __tinder_osc_a
        __tinder_osc_p_cwd
    }
    __tinder_prompt_end() {
        __tinder_osc_b
    }
    __tinder_preexec() {
        __tinder_osc_e "$BASH_COMMAND"
        __tinder_osc_c
    }

    __TINDER_ORIGINAL_PROMPT_COMMAND="${PROMPT_COMMAND-}"
    PROMPT_COMMAND='__tinder_prompt_start; '"$__TINDER_ORIGINAL_PROMPT_COMMAND"
    PS1="\[\$(__tinder_prompt_end)\]$PS1"
    trap '__tinder_preexec' DEBUG
fi

if [ "$__tinder_in_zsh" = "1" ]; then
    __tinder_zsh_precmd() {
        __TINDER_LAST_EXIT=$?
        __tinder_osc_d "$__TINDER_LAST_EXIT"
        __tinder_osc_a
        __tinder_osc_p_cwd
    }
    __tinder_zsh_preexec() {
        __tinder_osc_e "$1"
        __tinder_osc_c
    }
    autoload -Uz add-zsh-hook 2>/dev/null && {
        add-zsh-hook precmd __tinder_zsh_precmd
        add-zsh-hook preexec __tinder_zsh_preexec
    }
    PS1="%{$(__tinder_osc_b)%}$PS1"
fi
