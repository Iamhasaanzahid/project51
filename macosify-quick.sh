#!/usr/bin/env bash
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  MacOSIFY (Quick) - User Level Only${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Backup
BACKUP="$HOME/backups/xfce-macosify-quick-$(date +%Y%m%d-%H%M%S).tar.gz"
mkdir -p "$HOME/backups"
tar -czf "$BACKUP" ~/.config/xfce4 ~/.themes ~/.icons ~/.local/share/themes ~/.local/share/icons ~/.config/plank ~/.local/share/plank 2>/dev/null || true
echo -e "${GREEN}✓ Backup: $BACKUP${NC}"

mkdir -p "$HOME/.themes" "$HOME/.icons" "$HOME/.local/share/themes" "$HOME/.local/share/icons" "$HOME/Downloads/macosify-quick" "$HOME/.config/autostart"

# WhiteSur GTK
cd "$HOME/Downloads/macosify-quick"
if [ ! -d WhiteSur-gtk-theme ]; then
  git clone --depth=1 https://github.com/vinceliuice/WhiteSur-gtk-theme.git >/dev/null 2>&1
fi
cd WhiteSur-gtk-theme
./install.sh --silent >/dev/null 2>&1 || ./install.sh >/dev/null 2>&1 || true

# Icons
cd "$HOME/Downloads/macosify-quick"
if [ ! -d WhiteSur-icon-theme ]; then
  git clone --depth=1 https://github.com/vinceliuice/WhiteSur-icon-theme.git >/dev/null 2>&1
fi
cd WhiteSur-icon-theme
./install.sh >/dev/null 2>&1 || true

# Cursors
cd "$HOME/Downloads/macosify-quick"
if [ ! -d WhiteSur-cursors ]; then
  git clone --depth=1 https://github.com/vinceliuice/WhiteSur-cursors.git >/dev/null 2>&1
fi
cd WhiteSur-cursors
./install.sh >/dev/null 2>&1 || true

# Plank autostart
cat > "$HOME/.config/autostart/plank.desktop" << 'EOF'
[Desktop Entry]
Type=Application
Exec=plank
Name=Plank Dock
Comment=macOS Style Dock
X-GNOME-Autostart-enabled=true
EOF

# Plank config
mkdir -p "$HOME/.config/plank/dock1/launchers"
cat > "$HOME/.config/plank/dock1/settings" << 'EOF'
[PlankDockPreferences]
Position=0
IconSize=52
Theme=Transparent
HideMode=2
AutoHide=false
LockItems=true
PinnedOnly=false
EOF

# Picom autostart
cat > "$HOME/.config/autostart/picom.desktop" << 'EOF'
[Desktop Entry]
Type=Application
Exec=picom --daemon --vsync
Name=Picom
Comment=Smooth Compositor
X-GNOME-Autostart-enabled=true
EOF

# Apply XFCE
xfconf-query -c xsettings -p /Net/ThemeName -s "WhiteSur-Light" 2>/dev/null || true
xfconf-query -c xsettings -p /Net/IconThemeName -s "WhiteSur" 2>/dev/null || true
xfconf-query -c xsettings -p /Gtk/CursorThemeName -s "WhiteSur-cursors" 2>/dev/null || true
xfconf-query -c xsettings -p /Gtk/FontName -s "Inter 11" 2>/dev/null || true
xfconf-query -c xfwm4 -p /general/theme -s "WhiteSur-Light" 2>/dev/null || true
xfconf-query -c xfwm4 -p /general/title_font -s "Inter Bold 11" 2>/dev/null || true
xfconf-query -c xfwm4 -p /general/button_layout -s "CHM|" 2>/dev/null || true
xfconf-query -c xfce4-panel -p /panels/panel-0/position-locked -s "true" 2>/dev/null || true

echo ""
echo -e "${GREEN}✓ Muqammal macOS Look Apply Ho Chuka Hai Bro!${NC}"
echo ""
echo -e "${YELLOW}Ek baar Logout > Login kar le.${NC}"
echo -e "${YELLOW}Dock + Effects live dikhne lagenge us k baad.${NC}"
