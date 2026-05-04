import { SettingsTabs } from "@/features/settings/settings-tabs";
import { PageHeader } from "@/components/layout/PageHeader";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-cg-5">
      <PageHeader title="الإعدادات" subtitle="التحكم في الهوية والسلوك والقنوات والأمان" />
      <SettingsTabs />
    </div>
  );
}
