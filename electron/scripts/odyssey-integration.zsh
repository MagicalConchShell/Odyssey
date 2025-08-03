#!/usr/bin/env zsh
# Odyssey Terminal Shell Integration - ZSH (Improved Version)

if [[ -n "$ODYSSEY_TERMINAL" ]]; then
    # Cache the hostname to avoid repeated calls
    __odyssey_hostname="$(hostname)"

    # Function to percent-encode a string for a URI
    __odyssey_urlencode() {
        local string="${1}"
        local encoded
        # Zsh has a built-in modifier for this, much cleaner!
        encoded=${(j:/:)${(s:/:)string//\%/\%25}//\ /\%20}} # Basic encoding example
        # A more robust way using a loop is often better for all chars
        local char
        encoded=""
        for char in ${(s::)string}; do
            case "$char" in
                [-_.~a-zA-Z0-9/]) encoded+="$char" ;;
                *) encoded+=$(printf '%%%02x' "'$char") ;;
            esac
        done
        echo "$encoded"
    }

    __odyssey_cwd_hook() {
        local current_dir_encoded
        current_dir_encoded=$(__odyssey_urlencode "$PWD")

        printf '\033]633;P;Cwd=file://%s%s\007' "$__odyssey_hostname" "$current_dir_encoded"
    }

    # Use a more efficient hook: chpwd_functions runs only when directory changes
    if [[ -z "${chpwd_functions[(r)__odyssey_cwd_hook]}" ]]; then
        chpwd_functions+=(__odyssey_cwd_hook)
    fi

    # ... (precmd and preexec hooks can be set up similarly if needed for other things)

    # Initial call to set CWD at the start
    __odyssey_cwd_hook

    export ODYSSEY_SHELL_INTEGRATION=1
fi