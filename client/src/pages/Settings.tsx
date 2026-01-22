import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, User, Lock, Bell, Palette, Shield } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Switch } from '@/components/ui/Switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { useAuth } from '@/hooks/useAuth';
import { useUIStore, type Theme } from '@/stores/ui.store';
import { toastSuccess, toastError } from '@/hooks/useToast';

const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type ProfileFormData = z.infer<typeof profileSchema>;
type PasswordFormData = z.infer<typeof passwordSchema>;

export function Settings() {
  const { user, updateProfile, changePassword, isUpdateProfilePending, isChangePasswordPending } =
    useAuth();
  const { theme, setTheme, notifications, markAllNotificationsRead, clearNotifications } =
    useUIStore();

  const [notificationSettings, setNotificationSettings] = useState({
    emailNotifications: true,
    pushNotifications: true,
    processComplete: true,
    workflowComplete: true,
    errorAlerts: true,
  });

  const {
    register: registerProfile,
    handleSubmit: handleProfileSubmit,
    formState: { errors: profileErrors },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name || '',
      email: user?.email || '',
    },
  });

  const {
    register: registerPassword,
    handleSubmit: handlePasswordSubmit,
    formState: { errors: passwordErrors },
    reset: resetPassword,
  } = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
  });

  const onProfileSubmit = (data: ProfileFormData) => {
    updateProfile(data, {
      onSuccess: () => {
        toastSuccess('Profile updated', 'Your profile has been updated successfully.');
      },
      onError: () => {
        toastError('Update failed', 'Failed to update profile. Please try again.');
      },
    });
  };

  const onPasswordSubmit = (data: PasswordFormData) => {
    changePassword(
      { currentPassword: data.currentPassword, newPassword: data.newPassword },
      {
        onSuccess: () => {
          toastSuccess('Password changed', 'Your password has been changed successfully.');
          resetPassword();
        },
        onError: () => {
          toastError('Change failed', 'Failed to change password. Please check your current password.');
        },
      }
    );
  };

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    toastSuccess('Theme updated', `Theme set to ${newTheme}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account settings and preferences
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList>
          <TabsTrigger value="profile">
            <User className="mr-2 h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="security">
            <Lock className="mr-2 h-4 w-4" />
            Security
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="mr-2 h-4 w-4" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="appearance">
            <Palette className="mr-2 h-4 w-4" />
            Appearance
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>
                Update your account profile information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={handleProfileSubmit(onProfileSubmit)}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    {...registerProfile('name')}
                    className={profileErrors.name ? 'border-destructive' : ''}
                  />
                  {profileErrors.name && (
                    <p className="text-sm text-destructive">
                      {profileErrors.name.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    {...registerProfile('email')}
                    className={profileErrors.email ? 'border-destructive' : ''}
                  />
                  {profileErrors.email && (
                    <p className="text-sm text-destructive">
                      {profileErrors.email.message}
                    </p>
                  )}
                </div>

                <Button type="submit" disabled={isUpdateProfilePending}>
                  {isUpdateProfilePending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Save Changes
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Change Password</CardTitle>
                <CardDescription>
                  Update your password to keep your account secure
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={handlePasswordSubmit(onPasswordSubmit)}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">Current Password</Label>
                    <Input
                      id="currentPassword"
                      type="password"
                      {...registerPassword('currentPassword')}
                      className={
                        passwordErrors.currentPassword ? 'border-destructive' : ''
                      }
                    />
                    {passwordErrors.currentPassword && (
                      <p className="text-sm text-destructive">
                        {passwordErrors.currentPassword.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New Password</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      {...registerPassword('newPassword')}
                      className={
                        passwordErrors.newPassword ? 'border-destructive' : ''
                      }
                    />
                    {passwordErrors.newPassword && (
                      <p className="text-sm text-destructive">
                        {passwordErrors.newPassword.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      {...registerPassword('confirmPassword')}
                      className={
                        passwordErrors.confirmPassword ? 'border-destructive' : ''
                      }
                    />
                    {passwordErrors.confirmPassword && (
                      <p className="text-sm text-destructive">
                        {passwordErrors.confirmPassword.message}
                      </p>
                    )}
                  </div>

                  <Button type="submit" disabled={isChangePasswordPending}>
                    {isChangePasswordPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Change Password
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Two-Factor Authentication</CardTitle>
                <CardDescription>
                  Add an extra layer of security to your account
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Two-Factor Authentication</Label>
                    <p className="text-sm text-muted-foreground">
                      Require a code in addition to your password
                    </p>
                  </div>
                  <Switch disabled />
                </div>
                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertDescription>
                    Two-factor authentication is not yet available. Check back
                    soon for enhanced security options.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>
                Choose what notifications you want to receive
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h4 className="font-medium">Delivery Methods</h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Email Notifications</Label>
                      <p className="text-sm text-muted-foreground">
                        Receive notifications via email
                      </p>
                    </div>
                    <Switch
                      checked={notificationSettings.emailNotifications}
                      onCheckedChange={(checked) =>
                        setNotificationSettings({
                          ...notificationSettings,
                          emailNotifications: checked,
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Push Notifications</Label>
                      <p className="text-sm text-muted-foreground">
                        Receive in-app push notifications
                      </p>
                    </div>
                    <Switch
                      checked={notificationSettings.pushNotifications}
                      onCheckedChange={(checked) =>
                        setNotificationSettings({
                          ...notificationSettings,
                          pushNotifications: checked,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-medium">Event Types</h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Process Complete</Label>
                      <p className="text-sm text-muted-foreground">
                        When a Claude or Strudel process finishes
                      </p>
                    </div>
                    <Switch
                      checked={notificationSettings.processComplete}
                      onCheckedChange={(checked) =>
                        setNotificationSettings({
                          ...notificationSettings,
                          processComplete: checked,
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Workflow Complete</Label>
                      <p className="text-sm text-muted-foreground">
                        When an agent workflow finishes
                      </p>
                    </div>
                    <Switch
                      checked={notificationSettings.workflowComplete}
                      onCheckedChange={(checked) =>
                        setNotificationSettings({
                          ...notificationSettings,
                          workflowComplete: checked,
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Error Alerts</Label>
                      <p className="text-sm text-muted-foreground">
                        When a process or workflow fails
                      </p>
                    </div>
                    <Switch
                      checked={notificationSettings.errorAlerts}
                      onCheckedChange={(checked) =>
                        setNotificationSettings({
                          ...notificationSettings,
                          errorAlerts: checked,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>
                      Notification History ({notifications.filter((n) => !n.read).length}{' '}
                      unread)
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {notifications.length} total notifications
                    </p>
                  </div>
                  <div className="space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => markAllNotificationsRead()}
                    >
                      Mark All Read
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => clearNotifications()}
                    >
                      Clear All
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Appearance Tab */}
        <TabsContent value="appearance">
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>
                Customize how Slop Studios looks for you
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Theme</Label>
                <Select value={theme} onValueChange={(v) => handleThemeChange(v as Theme)}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Select your preferred color theme
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div
                  className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                    theme === 'light' ? 'border-primary bg-primary/5' : ''
                  }`}
                  onClick={() => handleThemeChange('light')}
                >
                  <div className="mb-2 h-20 rounded bg-white border"></div>
                  <p className="text-sm font-medium">Light</p>
                </div>
                <div
                  className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                    theme === 'dark' ? 'border-primary bg-primary/5' : ''
                  }`}
                  onClick={() => handleThemeChange('dark')}
                >
                  <div className="mb-2 h-20 rounded bg-slate-900"></div>
                  <p className="text-sm font-medium">Dark</p>
                </div>
                <div
                  className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                    theme === 'system' ? 'border-primary bg-primary/5' : ''
                  }`}
                  onClick={() => handleThemeChange('system')}
                >
                  <div className="mb-2 h-20 rounded bg-gradient-to-r from-white to-slate-900 border"></div>
                  <p className="text-sm font-medium">System</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default Settings;
