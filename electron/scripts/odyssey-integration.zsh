#!/usr/bin/env zsh
# Odyssey Terminal Shell Integration - ZSH with Command History Tracking

if [[ -n "$ODYSSEY_TERMINAL" ]]; then
    echo "[Odyssey] Shell integration loading..."
    
    # Cache the hostname to avoid repeated calls
    __odyssey_hostname="$(hostname)"

    # Function to percent-encode a string for a URI
    __odyssey_urlencode() {
        local string="${1}"
        local encoded=""
        local char
        for char in ${(s::)string}; do
            case "$char" in
                [-_.~a-zA-Z0-9/]) encoded+="$char" ;;
                *) encoded+=$(printf '%%%02x' "'$char") ;;
            esac
        done
        echo "$encoded"
    }

    # CWD tracking hook
    __odyssey_cwd_hook() {
        local current_dir_encoded
        current_dir_encoded=$(__odyssey_urlencode "$PWD")
        printf '\033]633;P;Cwd=file://%s%s\007' "$__odyssey_hostname" "$current_dir_encoded"
    }

    # Command tracking variables
    __odyssey_command_start_time=""
    __odyssey_current_command=""

    # Store original functions if they exist
    if typeset -f preexec >/dev/null 2>&1; then
        functions[__odyssey_original_preexec]=$functions[preexec]
    fi
    if typeset -f precmd >/dev/null 2>&1; then  
        functions[__odyssey_original_precmd]=$functions[precmd]
    fi

    # Direct override of preexec function
    preexec() {
        echo "[TEST] preexec called: $1"
        
        # Our command tracking logic
        __odyssey_current_command="$2"
        __odyssey_command_start_time="$(date +%s)"
        
        # Encode command for transmission
        local command_encoded
        command_encoded=$(__odyssey_urlencode "$2")
        
        # Send command start marker
        local cwd_encoded
        cwd_encoded=$(__odyssey_urlencode "$PWD")
        printf '\033]633;A;C=%s&T=%s&Cwd=%s\007' "$command_encoded" "$__odyssey_command_start_time" "$cwd_encoded"
        
        # Call original preexec if it existed
        if typeset -f __odyssey_original_preexec >/dev/null 2>&1; then
            __odyssey_original_preexec "$@"
        fi
    }

    # Direct override of precmd function  
    precmd() {
        local exit_code="$?"
        echo "[TEST] precmd called, exit: $exit_code"
        
        # Send command end marker if we had a command
        if [[ -n "$__odyssey_current_command" ]]; then
            local end_time="$(date +%s)"
            printf '\033]633;B;E=%d&T=%s\007' "$exit_code" "$end_time"
            __odyssey_current_command=""
            __odyssey_command_start_time=""
        fi
        
        # Update CWD
        __odyssey_cwd_hook
        
        # Call original precmd if it existed
        if typeset -f __odyssey_original_precmd >/dev/null 2>&1; then
            __odyssey_original_precmd
        fi
    }

    # Initial CWD setup
    __odyssey_cwd_hook

    export ODYSSEY_SHELL_INTEGRATION=1
    echo "[Odyssey] Shell integration setup complete!"
fi