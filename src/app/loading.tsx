import { AccountPage } from "@/features/auth/account-page";
export default function Loading() {
  return <AccountPage title="正在打开衣橱" description="请稍候…"><p role="status">正在加载</p></AccountPage>;
}
