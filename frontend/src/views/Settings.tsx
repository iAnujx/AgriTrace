// @ts-nocheck -- legacy pages ported from the original project
import { useState, useEffect } from "react";
import { useNavigate } from "@/lib/router-compat";
import { endSession } from "@/lib/session";
import { applyAppearance, loadAppearance, saveAppearance } from "@/lib/appearance";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { 
  Sprout, Search, Bell, User, LogOut, Menu, LayoutDashboard, 
  Route, Package, Users, Settings as SettingsIcon, 
  Moon, Sun, Monitor, Palette, Shield, Database, 
  Save, RotateCcw, Eye, EyeOff
} from "lucide-react";

interface User {
  address: string;
  role: string;
  connectedAt: string;
}

interface SettingsData {
  theme: 'light' | 'dark' | 'system';
  notifications: {
    email: boolean;
    push: boolean;
    batch_updates: boolean;
    security_alerts: boolean;
  };
  privacy: {
    data_sharing: boolean;
    analytics: boolean;
    public_profile: boolean;
  };
  display: {
    compact_mode: boolean;
    show_tips: boolean;
    animated_ui: boolean;
  };
}

const Settings = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [settings, setSettings] = useState<SettingsData>({
    theme: 'light',
    notifications: {
      email: true,
      push: true,
      batch_updates: true,
      security_alerts: true,
    },
    privacy: {
      data_sharing: false,
      analytics: true,
      public_profile: false,
    },
    display: {
      compact_mode: false,
      show_tips: true,
      animated_ui: true,
    }
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [fontSize, setFontSize] = useState(loadAppearance().fontSize);
  const [contrast, setContrast] = useState(loadAppearance().highContrast);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Check if user is logged in
    const userData = localStorage.getItem('agritrace-user');
    if (!userData) {
      navigate('/login');
      return;
    }

    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);

    // Load saved settings
    const savedSettings = localStorage.getItem('agritrace-settings');
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }
  }, [navigate]);

  const logout = () => {
    void endSession().then(() => navigate('/login'));
  };

  const updateSetting = (category: keyof SettingsData, key: string, value: any) => {
    setSettings(prev => {
      const categoryData = prev[category] as Record<string, any>;
      return {
        ...prev,
        [category]: {
          ...categoryData,
          [key]: value
        }
      };
    });
    setHasChanges(true);
  };

  const updateTheme = (theme: 'light' | 'dark' | 'system') => {
    setSettings(prev => ({ ...prev, theme }));
    setHasChanges(true);
    
    // Apply theme immediately
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (theme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      // System preference
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };

  const saveSettings = () => {
    localStorage.setItem('agritrace-settings', JSON.stringify(settings));
    applyAppearance();
    setHasChanges(false);
    toast({
      title: "Settings saved",
      description: "Your preferences have been updated successfully.",
    });
  };

  const resetSettings = () => {
    const defaultSettings: SettingsData = {
      theme: 'light',
      notifications: {
        email: true,
        push: true,
        batch_updates: true,
        security_alerts: true,
      },
      privacy: {
        data_sharing: false,
        analytics: true,
        public_profile: false,
      },
      display: {
        compact_mode: false,
        show_tips: true,
        animated_ui: true,
      }
    };
    setSettings(defaultSettings);
    setHasChanges(true);
    toast({
      title: "Settings reset",
      description: "All settings have been restored to defaults.",
    });
  };

  const navigationItems = [
    { icon: LayoutDashboard, label: "Dashboard", onClick: () => navigate('/dashboard') },
    { icon: Route, label: "Traceability", onClick: () => navigate('/traceability') },
    { icon: Package, label: "Register Batch", onClick: () => navigate('/register') },
    { icon: Users, label: "Stakeholders", onClick: () => navigate('/stakeholders') },
    { icon: SettingsIcon, label: "Settings", active: true }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            {/* Mobile menu */}
            <Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
                    <Sprout className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div>
                    <h2 className="font-semibold">AgriTrace</h2>
                    <p className="text-sm text-muted-foreground">Farm to Table</p>
                  </div>
                </div>
                <nav className="space-y-2">
                  {navigationItems.map((item, index) => {
                    const IconComponent = item.icon;
                    return (
                      <Button
                        key={index}
                        variant={item.active ? "secondary" : "ghost"}
                        className="w-full justify-start"
                        onClick={item.onClick}
                      >
                        <IconComponent className="mr-3 h-4 w-4" />
                        {item.label}
                      </Button>
                    );
                  })}
                </nav>
              </SheetContent>
            </Sheet>

            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-primary">
                <Sprout className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="hidden sm:block">
                <h1 className="font-semibold text-lg">AgriTrace</h1>
                <p className="text-sm text-muted-foreground">Farm to Table</p>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="hidden sm:flex items-center max-w-md w-full mx-8">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search settings..."
                className="pl-10 input-modern"
              />
            </div>
          </div>

          {/* User actions */}
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs bg-primary">
                2
              </Badge>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                      {user?.role.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden sm:block text-left">
                    <p className="text-sm font-medium">
                      {user?.address.slice(0, 6)}...{user?.address.slice(-4)}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => navigate('/profile')}>
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/settings')}>
                  <SettingsIcon className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <Separator className="my-1" />
                <DropdownMenuItem onClick={logout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex w-72 flex-col bg-sidebar border-r border-sidebar-border">
          <div className="p-6">
            <nav className="space-y-2">
              {navigationItems.map((item, index) => {
                const IconComponent = item.icon;
                return (
                  <Button
                    key={index}
                    variant={item.active ? "secondary" : "ghost"}
                    className="w-full justify-start"
                    onClick={item.onClick}
                  >
                    <IconComponent className="mr-3 h-4 w-4" />
                    {item.label}
                  </Button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden">
          <div className="p-6">
            <div className="mb-8">
              <h1 className="text-3xl font-bold mb-2">Settings</h1>
              <p className="text-muted-foreground">Customize your AgriTrace experience</p>
            </div>

            <div className="max-w-4xl">
              <Tabs defaultValue="appearance" className="space-y-6">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="appearance">Appearance</TabsTrigger>
                  <TabsTrigger value="notifications">Notifications</TabsTrigger>
                  <TabsTrigger value="privacy">Privacy</TabsTrigger>
                  <TabsTrigger value="display">Display</TabsTrigger>
                </TabsList>

                <TabsContent value="appearance" className="space-y-6">
                  <Card className="card-modern">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Palette className="h-5 w-5" />
                        Theme Preferences
                      </CardTitle>
                      <CardDescription>
                        Choose how AgriTrace appears on your device
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div 
                          className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                            settings.theme === 'light' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                          }`}
                          onClick={() => updateTheme('light')}
                        >
                          <div className="flex items-center gap-3">
                            <Sun className="h-5 w-5" />
                            <div>
                              <p className="font-medium">Light</p>
                              <p className="text-sm text-muted-foreground">Clean and bright</p>
                            </div>
                          </div>
                        </div>
                        
                        <div 
                          className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                            settings.theme === 'dark' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                          }`}
                          onClick={() => updateTheme('dark')}
                        >
                          <div className="flex items-center gap-3">
                            <Moon className="h-5 w-5" />
                            <div>
                              <p className="font-medium">Dark</p>
                              <p className="text-sm text-muted-foreground">Easy on the eyes</p>
                            </div>
                          </div>
                        </div>
                        
                        <div 
                          className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                            settings.theme === 'system' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                          }`}
                          onClick={() => updateTheme('system')}
                        >
                          <div className="flex items-center gap-3">
                            <Monitor className="h-5 w-5" />
                            <div>
                              <p className="font-medium">System</p>
                              <p className="text-sm text-muted-foreground">Follow device setting</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="notifications" className="space-y-6">
                  <Card className="card-modern">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Bell className="h-5 w-5" />
                        Notification Settings
                      </CardTitle>
                      <CardDescription>
                        Control when and how you receive notifications
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label htmlFor="email-notifications">Email Notifications</Label>
                            <p className="text-sm text-muted-foreground">Receive updates via email</p>
                          </div>
                          <Switch
                            id="email-notifications"
                            checked={settings.notifications.email}
                            onCheckedChange={(checked) => updateSetting('notifications', 'email', checked)}
                          />
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <div>
                            <Label htmlFor="push-notifications">Push Notifications</Label>
                            <p className="text-sm text-muted-foreground">Receive browser notifications</p>
                          </div>
                          <Switch
                            id="push-notifications"
                            checked={settings.notifications.push}
                            onCheckedChange={(checked) => updateSetting('notifications', 'push', checked)}
                          />
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <div>
                            <Label htmlFor="batch-updates">Batch Updates</Label>
                            <p className="text-sm text-muted-foreground">Notify about batch status changes</p>
                          </div>
                          <Switch
                            id="batch-updates"
                            checked={settings.notifications.batch_updates}
                            onCheckedChange={(checked) => updateSetting('notifications', 'batch_updates', checked)}
                          />
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <div>
                            <Label htmlFor="security-alerts">Security Alerts</Label>
                            <p className="text-sm text-muted-foreground">Important security notifications</p>
                          </div>
                          <Switch
                            id="security-alerts"
                            checked={settings.notifications.security_alerts}
                            onCheckedChange={(checked) => updateSetting('notifications', 'security_alerts', checked)}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="privacy" className="space-y-6">
                  <Card className="card-modern">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        Privacy & Security
                      </CardTitle>
                      <CardDescription>
                        Manage your data privacy and security preferences
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label htmlFor="data-sharing">Data Sharing</Label>
                            <p className="text-sm text-muted-foreground">Share anonymized data for research</p>
                          </div>
                          <Switch
                            id="data-sharing"
                            checked={settings.privacy.data_sharing}
                            onCheckedChange={(checked) => updateSetting('privacy', 'data_sharing', checked)}
                          />
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <div>
                            <Label htmlFor="analytics">Usage Analytics</Label>
                            <p className="text-sm text-muted-foreground">Help improve AgriTrace with usage data</p>
                          </div>
                          <Switch
                            id="analytics"
                            checked={settings.privacy.analytics}
                            onCheckedChange={(checked) => updateSetting('privacy', 'analytics', checked)}
                          />
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <div>
                            <Label htmlFor="public-profile">Public Profile</Label>
                            <p className="text-sm text-muted-foreground">Make your profile visible to other users</p>
                          </div>
                          <Switch
                            id="public-profile"
                            checked={settings.privacy.public_profile}
                            onCheckedChange={(checked) => updateSetting('privacy', 'public_profile', checked)}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="display" className="space-y-6">
                  <Card className="card-modern">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Eye className="h-5 w-5" />
                        Display Options
                      </CardTitle>
                      <CardDescription>
                        Customize how information is displayed
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label>Text size</Label>
                            <p className="text-sm text-muted-foreground">Bigger text is easier to read outdoors. Applies at once.</p>
                          </div>
                          <div className="flex gap-1 rounded-xl bg-muted p-1">
                            {['small', 'medium', 'large'].map((sz) => (
                              <Button key={sz} size="sm" variant={fontSize === sz ? 'default' : 'ghost'} className="capitalize" onClick={() => { const n = { ...loadAppearance(), fontSize: sz }; saveAppearance(n); setFontSize(sz); }}>{sz}</Button>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <Label htmlFor="high-contrast">High contrast</Label>
                            <p className="text-sm text-muted-foreground">Stronger borders and text for easier reading</p>
                          </div>
                          <Switch id="high-contrast" checked={contrast} onCheckedChange={(v) => { saveAppearance({ ...loadAppearance(), highContrast: v }); setContrast(v); }} />
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <Label htmlFor="compact-mode">Compact Mode</Label>
                            <p className="text-sm text-muted-foreground">Show more information in less space</p>
                          </div>
                          <Switch
                            id="compact-mode"
                            checked={settings.display.compact_mode}
                            onCheckedChange={(checked) => updateSetting('display', 'compact_mode', checked)}
                          />
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <div>
                            <Label htmlFor="show-tips">Show Tips</Label>
                            <p className="text-sm text-muted-foreground">Display helpful tips and tutorials</p>
                          </div>
                          <Switch
                            id="show-tips"
                            checked={settings.display.show_tips}
                            onCheckedChange={(checked) => updateSetting('display', 'show_tips', checked)}
                          />
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <div>
                            <Label htmlFor="animated-ui">Animated UI</Label>
                            <p className="text-sm text-muted-foreground">Enable smooth animations and transitions</p>
                          </div>
                          <Switch
                            id="animated-ui"
                            checked={settings.display.animated_ui}
                            onCheckedChange={(checked) => updateSetting('display', 'animated_ui', checked)}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>

              {/* Action Buttons */}
              {hasChanges && (
                <Card className="card-modern border-primary/20 bg-primary/5">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">You have unsaved changes</p>
                        <p className="text-sm text-muted-foreground">Save your settings to apply changes</p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={resetSettings}>
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Reset
                        </Button>
                        <Button onClick={saveSettings} className="btn-primary">
                          <Save className="h-4 w-4 mr-2" />
                          Save Changes
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Settings;