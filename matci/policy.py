"""Conservative explanations, never a claim that closing an app is safe."""

BUILTIN_APP_IDS = frozenset({
    'org.gnome.Shell.desktop', 'org.gnome.Terminal.desktop', 'org.gnome.Console.desktop',
    'org.kde.konsole.desktop', 'com.mitchellh.ghostty.desktop', 'Alacritty.desktop',
    'kitty.desktop', 'code.desktop', 'codium.desktop', 'jetbrains-idea.desktop',
    'org.gnome.Builder.desktop', 'dev.zed.Zed.desktop', 'com.openai.Codex.desktop',
    'org.gnome.Ptyxis.desktop', 'org.gnome.TextEditor.desktop', 'org.gnome.gedit.desktop',
    'code-insiders.desktop', 'com.visualstudio.code.desktop',
})
TERMINAL_COMMS = frozenset({'gnome-terminal-', 'gnome-terminal', 'gnome-console', 'kgx',
                           'konsole', 'kitty', 'alacritty', 'ghostty', 'xterm', 'wezterm-gui',
                           'bash', 'zsh', 'fish', 'sh', 'tmux', 'screen', 'ptyxis'})
DEV_COMMS = frozenset({'code', 'codium', 'codex', 'claude', 'node', 'npm', 'npx', 'python',
                      'python3', 'java', 'idea', 'rustc', 'cargo', 'gcc', 'cc1', 'make',
                      'ninja', 'cmake', 'gjs', 'builder', 'zed', 'Xwayland', 'gnome-shell',
                      'systemd', 'dbus-daemon', 'dbus-broker', 'pipewire', 'wireplumber',
                      'gnome-text-edit', 'gedit'})


def builtin_process_reason(comm):
    name = comm.lower()
    if name in TERMINAL_COMMS:
        return 'BUILTIN_TERMINAL'
    if name in {n.lower() for n in DEV_COMMS} or name.startswith(('python3.', 'code-', 'jetbrains')):
        return 'BUILTIN_SYSTEM_OR_DEVELOPMENT'
    return None


def classify(app_id, processes, user_protected=(), mapped=True,
             requested_classification='unknown', requested_reason='MAPPING_UNCERTAIN'):
    if app_id in BUILTIN_APP_IDS:
        return 'protected', 'BUILTIN_PROTECTED'
    if app_id in user_protected:
        return 'protected', 'USER_PROTECTED'
    if not mapped or not processes:
        return 'unknown', 'MAPPING_UNCERTAIN'
    if any(p.get('protection_reason') or builtin_process_reason(p.get('comm', '')) for p in processes):
        return 'protected', 'BUILTIN_PROCESS_PROTECTED'
    if any(p.get('has_work_descendants') for p in processes):
        return 'protected', 'WORK_DESCENDANT'
    if any(p.get('cpu_fraction_one_core') is None for p in processes):
        return 'unknown', 'CPU_BASELINE_PENDING'
    if any(p['cpu_fraction_one_core'] > 0.02 for p in processes):
        return 'active', 'CPU_ACTIVE'
    if requested_classification == 'candidate':
        return 'candidate', 'USER_REVIEW_REQUIRED'
    return requested_classification, requested_reason


def aggregate(processes):
    if not processes:
        return 'unavailable', None, 'unavailable'
    kinds = {p['metric_kind'] for p in processes}
    if len(kinds) != 1 or 'unavailable' in kinds or any(p['memory_bytes'] is None for p in processes):
        return 'unavailable', None, 'partial'
    coverage = 'complete' if all(p['coverage'] == 'complete' for p in processes) else 'partial'
    return next(iter(kinds)), sum(p['memory_bytes'] for p in processes), coverage
