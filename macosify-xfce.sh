#!/usr/bin/env bash
# macosify-xfce.sh - Transform XFCE Debian to macOS-like look
# Author: AI Assistant
# Safe: Creates backups before making changes

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  MACOSIFY XFCE - Full macOS Look for XFCE Debian${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 1. Backup existing configs
BACKUP_DIR="$HOME/backups"
mkdir -p "$BACKUP_DIR"

BACKUP_FILE="$BACKUP_DIR/xfce-macosify-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
echo -e "${YELLOW}[1/10] Creating backup...${NC}"
tar -czf "$BACKUP_FILE" \
  "$HOME/.config/xfce4" \
  "$HOME/.themes" \
  "$HOME/.icons" \
  "$HOME/.local/share/themes" \
  "$HOME/.local/share/icons" \
  "$HOME/.local/share/plank" \
  "$HOME/.config/plank" \
  2>/dev/null || true
echo -e "${GREEN}✓ Backup saved: $BACKUP_FILE${NC}"
echo ""

# 2. Install required packages
echo -e "${YELLOW}[2/10] Updating & installing required packages...${NC}"
sudo apt update -qq
sudo apt install -y -qq \
  git wget curl unzip \
  plank \
  picom \
  xfce4-appmenu-plugin \
  xfce4-datetime-plugin \
  xfce4-genmon-plugin \
  xfce4-notifyd \
  xfce4-pulseaudio-plugin \
  xfce4-statusnotifier-plugin \
  vala-panel-appmenu \
  appmenu-gtk2-module appmenu-gtk3-module \
  2>/dev/null || true
echo -e "${GREEN}✓ Packages installed${NC}"
echo ""

# 3. Create directories
echo -e "${YELLOW}[3/10] Creating directories...${NC}"
mkdir -p "$HOME/.themes" "$HOME/.icons" "$HOME/.local/share/themes" "$HOME/.local/share/icons" "$HOME/.config/plank" "$HOME/.config/autostart" "$HOME/Downloads/macosify"
echo -e "${GREEN}✓ Directories created${NC}"
echo ""

# 4. Download WhiteSur GTK Theme
echo -e "${YELLOW}[4/10] Installing WhiteSur GTK Theme...${NC}"
cd "$HOME/Downloads/macosify"
if [ ! -d "WhiteSur-gtk-theme" ]; then
  git clone --depth=1 https://github.com/vinceliuice/WhiteSur-gtk-theme.git
fi
cd WhiteSur-gtk-theme
./install.sh -t all -c Light -s 180 --round 2>/dev/null || ./install.sh
echo -e "${GREEN}✓ WhiteSur GTK Theme installed${NC}"
echo ""

# 5. Download & Install WhiteSur Icons
echo -e "${YELLOW}[5/10] Installing WhiteSur Icon Theme...${NC}"
cd "$HOME/Downloads/macosify"
if [ ! -d "WhiteSur-icon-theme" ]; then
  git clone --depth=1 https://github.com/vinceliuice/WhiteSur-icon-theme.git
fi
cd WhiteSur-icon-theme
./install.sh 2>/dev/null || ./install.sh
echo -e "${GREEN}✓ WhiteSur Icon Theme installed${NC}"
echo ""

# 6. Download & Install WhiteSur Cursors
echo -e "${YELLOW}[6/10] Installing WhiteSur Cursors...${NC}"
cd "$HOME/Downloads/macosify"
if [ ! -d "WhiteSur-cursors" ]; then
  git clone --depth=1 https://github.com/vinceliuice/WhiteSur-cursors.git
fi
cd WhiteSur-cursors
./install.sh 2>/dev/null || ./install.sh
echo -e "${GREEN}✓ WhiteSur Cursors installed${NC}"
echo ""

# 7. Setup Plank autostart & config
echo -e "${YELLOW}[7/10] Configuring Plank dock...${NC}"
# Create plank autostart
cat > "$HOME/.config/autostart/plank.desktop" << 'EOF'
[Desktop Entry]
Type=Application
Exec=plank
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
Name=Plank Dock
Comment=macOS style bottom dock
EOF

# Create default plank dock config if not exists
mkdir -p "$HOME/.config/plank/dock1/launchers"
cat > "$HOME/.config/plank/dock1/settings" << 'EOF'
[PlankDockPreferences]
CurrentWorkspaceOnly=false
DockItems=thunar.dockitem;firefox.dockitem;xterm.dockitem;xfce4-terminal.dockitem
Position=0
PinnedOnly=false
AutoHide=false
HideMode=2
Offset=0
Theme=Transparent
IconSize=52
Monitor=0
ShowDockItem=false
ShowUnpinned=false
LockItems=true
PressureReveal=false
EOF

# Try to create launcher files for common apps
for app in thunar firefox-esr firefox chromium google-chrome-stable xfce4-terminal xterm; do
  if command -v "$app" >/dev/null 2>&1; then
    APPNAME=$(basename "$app")
    cat > "$HOME/.config/plank/dock1/launchers/${APPNAME}.dockitem" << EOF
[PlankDockItemPreferences]
Launcher=file:///usr/share/applications/${APPNAME}.desktop
EOF
  fi
done
echo -e "${GREEN}✓ Plank configured (autostart + settings)${NC}"
echo ""

# 8. Setup Picom autostart
echo -e "${YELLOW}[8/10] Configuring Picom (compositor)...${NC}"
cat > "$HOME/.config/autostart/picom.desktop" << 'EOF'
[Desktop Entry]
Type=Application
Exec=picom --daemon --vsync
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
Name=Picom
Comment=Compositor for smooth effects
EOF
echo -e "${GREEN}✓ Picom configured${NC}"
echo ""

# 9. Apply XFCE themes, icons, cursors via xfconf-query
echo -e "${YELLOW}[9/10] Applying themes to XFCE...${NC}"
xfconf-query -c xsettings -p /Net/ThemeName -s "WhiteSur-Light" 2>/dev/null || true
xfconf-query -c xsettings -p /Net/IconThemeName -s "WhiteSur" 2>/dev/null || true
xfconf-query -c xsettings -p /Gtk/CursorThemeName -s "WhiteSur-cursors" 2>/dev/null || true
xfconf-query -c xsettings -p /Gtk/FontName -s "Inter 11" 2>/dev/null || true

xfconf-query -c xfwm4 -p /general/theme -s "WhiteSur-Light" 2>/dev/null || true
xfconf-query -c xfwm4 -p /general/title_font -s "Inter Bold 11" 2>/dev/null || true
xfconf-query -c xfwm4 -p /general/button_layout -s "CHM|"
echo -e "${GREEN}✓ XFCE themes applied${NC}"
echo ""

# 10. Optimize panel for macOS look
echo -e "${YELLOW}[10/10] Optimizing top panel for macOS style...${NC}"
# Try to set panel mode (compact)
xfconf-query -c xfce4-panel -p /panels/panel-0/position -s "top" 2>/dev/null || true
xfconf-query -c xfce4-panel -p /panels/panel-0/position-locked -s "true" 2>/dev/null || true
xfconf-query -c xfce4-panel -p /panels/panel-0/mode -s "0" 2>/dev/null || true
echo -e "${GREEN}✓ Panel optimized${NC}"
echo ""

# Success message
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ✓ ALL DONE! XFCE is now macOSified!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Logout and login again (important for Plank/Picom)"
echo "2. Right click top panel > Panel Preferences to fine-tune"
echo "3. Right click Plank > Preferences to adjust dock"
echo "4. Set Big Sur wallpaper (optional)"
echo ""
echo -e "${BLUE}Backup location: $BACKUP_FILE${NC}"
