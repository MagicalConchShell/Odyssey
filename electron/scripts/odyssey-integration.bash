#!/usr/bin/env bash
# Odyssey Terminal Shell Integration - Bash (Improved Version)

if [[ -n "$ODYSSEY_TERMINAL" ]]; then
    # Cache the hostname to avoid repeated calls
    __odyssey_hostname="$(hostname)"

    # Function to percent-encode a string for a URI
    __odyssey_urlencode() {
        local string="${1}"
        local strlen=${#string}
        local encoded=""
        local pos c o

        for (( pos=0 ; pos<strlen ; pos++ )); do
            c=${string:$pos:1}
            case "$c" in
                [-_.~a-zA-Z0-9/] ) o="$c" ;;
                * )               printf -v o '%%%02x' "'$c"
            esac
            encoded+="$o"
        done
        echo "$encoded"
    }

    __odyssey_cwd_hook() {
        local current_dir_encoded
        current_dir_encoded=$(__odyssey_urlencode "$PWD")

        # Send OSC sequence with encoded current directory
        printf '\033]633;P;Cwd=file://%s%s\007' "$__odyssey_hostname" "$current_dir_encoded"
    }

    if [[ -z "$PROMPT_COMMAND" ]]; then
        PROMPT_COMMAND="__odyssey_cwd_hook"
    else
        case ";$PROMPT_COMMAND;" in
            *";__odyssey_cwd_hook;"*) ;;
            *) PROMPT_COMMAND="$PROMPT_COMMAND;__odyssey_cwd_hook" ;;
        esac
    fi

    __odyssey_cwd_hook
    export ODYSSEY_SHELL_INTEGRATION=1
fi