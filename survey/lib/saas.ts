import { DEV_ORG_NAME, DEV_ORG_ID } from "@/lib/saas-constants";
import { ensureOrganization, getOrganizationProfile } from "@/lib/saas-store";

export { DEV_ORG_ID, DEV_ORG_NAME };

export async function ensureDevOrganization() {
  return ensureOrganization(DEV_ORG_ID, DEV_ORG_NAME);
}

export async function getDevOrganizationProfile() {
  await ensureDevOrganization();
  return getOrganizationProfile(DEV_ORG_ID);
}
