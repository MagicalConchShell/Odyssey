#!/usr/bin/env bash
# Odyssey Terminal Shell Integration - Bash with Command History Tracking

if [[ -n "$ODYSSEY_TERMINAL" ]]; then
    echo "[Odyssey-BASH] 🚀 Shell integration loading for terminal session"
    echo "[Odyssey-BASH] Environment: ODYSSEY_TERMINAL=$ODYSSEY_TERMINAL"
    
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

    # CWD tracking hook
    __odyssey_cwd_hook() {
        local current_dir_encoded
        current_dir_encoded=$(__odyssey_urlencode "$PWD")
        printf '\033]633;P;Cwd=file://%s%s\007' "$__odyssey_hostname" "$current_dir_encoded"
    }

    # Command tracking variables
    __odyssey_command_start_time=""
    __odyssey_current_command=""
    __odyssey_in_command=0

    # Pre-execution hook - called before command execution using DEBUG trap
    __odyssey_preexec_hook() {
        # Only process if we're not already in a command and this is a real command
        if [[ $__odyssey_in_command -eq 0 && -n "$BASH_COMMAND" && "$BASH_COMMAND" != "__odyssey_precmd_hook" ]]; then
            echo "[Odyssey-BASH] 📝 DEBUG trap triggered for command: $BASH_COMMAND"
            __odyssey_current_command="$BASH_COMMAND"
            __odyssey_command_start_time="$(date +%s)"
            __odyssey_in_command=1
            
            # Encode command for transmission
            local command_encoded
            command_encoded=$(__odyssey_urlencode "$BASH_COMMAND")
            
            # Send command start marker with metadata
            # Format: OSC 633;A;C=<command>&T=<timestamp>&Cwd=<cwd>
            local cwd_encoded
            cwd_encoded=$(__odyssey_urlencode "$PWD")
            echo "[Odyssey-BASH] 🚀 Sending OSC 633;A sequence"
            printf '\033]633;A;C=%s&T=%s&Cwd=%s\007' "$command_encoded" "$__odyssey_command_start_time" "$cwd_encoded"
        fi
    }

    # Pre-command hook - called before each prompt
    __odyssey_precmd_hook() {
        local exit_code="$?"
        echo "[Odyssey-BASH] 🏁 PROMPT_COMMAND triggered with exit code: $exit_code"
        
        # Send command end marker with exit code if we had a command
        if [[ $__odyssey_in_command -eq 1 && -n "$__odyssey_current_command" ]]; then
            echo "[Odyssey-BASH] ✅ Sending OSC 633;B sequence for command: $__odyssey_current_command"
            local end_time="$(date +%s)"
            printf '\033]633;B;E=%d&T=%s\007' "$exit_code" "$end_time"
            __odyssey_current_command=""
            __odyssey_command_start_time=""
            __odyssey_in_command=0
        else
            echo "[Odyssey-BASH] ⚠️ No current command to end (in_command=$__odyssey_in_command)"
        fi
        
        # Also update CWD in case it changed
        __odyssey_cwd_hook
    }

    # Set up DEBUG trap for preexec functionality
    echo "[Odyssey-BASH] 🔧 Setting up shell hooks..."
    trap '__odyssey_preexec_hook' DEBUG
    echo "[Odyssey-BASH] ✅ Set DEBUG trap for preexec"

    # Set up PROMPT_COMMAND for precmd functionality
    if [[ -z "$PROMPT_COMMAND" ]]; then
        PROMPT_COMMAND="__odyssey_precmd_hook"
        echo "[Odyssey-BASH] ✅ Set PROMPT_COMMAND (was empty)"
    else
        case ";$PROMPT_COMMAND;" in
            *";__odyssey_precmd_hook;"*) 
                echo "[Odyssey-BASH] ✅ PROMPT_COMMAND already contains our hook"
                ;;
            *) 
                PROMPT_COMMAND="$PROMPT_COMMAND;__odyssey_precmd_hook"
                echo "[Odyssey-BASH] ✅ Added to existing PROMPT_COMMAND"
                ;;
        esac
    fi
    
    echo "[Odyssey-BASH] 📊 Final PROMPT_COMMAND: $PROMPT_COMMAND"

    # Initial call to set CWD at the start
    echo "[Odyssey-BASH] 📍 Setting initial CWD"
    __odyssey_cwd_hook

    export ODYSSEY_SHELL_INTEGRATION=1
    echo "[Odyssey-BASH] 🎉 Shell integration setup complete!"
fi