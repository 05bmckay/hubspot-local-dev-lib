import { AxiosPromise } from 'axios';
import { getAxiosConfig } from '../http/getAxiosConfig';
import { http } from '../http';
import { ENVIRONMENTS } from '../constants/environments';
import { Environment } from '../types/Config';
import { ScopeData } from '../types/Accounts';
import axios from 'axios';
import { HUBSPOT_ACCOUNT_TYPES } from '../constants/config';
import { ValueOf } from '../types/Utils';
import { PublicAppInstallationData } from '../types/Apps';

const LOCALDEVAUTH_API_AUTH_PATH = 'localdevauth/v1/auth';

type AccessTokenResponse = {
  hubId: number;
  userId: number;
  oauthAccessToken: string;
  expiresAtMillis: number;
  enabledFeatures?: { [key: string]: number };
  scopeGroups: Array<string>;
  encodedOAuthRefreshToken: string;
  hubName: string;
  accountType: ValueOf<typeof HUBSPOT_ACCOUNT_TYPES>;
};

export function fetchAccessToken(
  personalAccessKey: string,
  env: Environment = ENVIRONMENTS.PROD,
  portalId?: number
): AxiosPromise<AccessTokenResponse> {
  const axiosConfig = getAxiosConfig({
    env,
    localHostOverride: true,
    url: `${LOCALDEVAUTH_API_AUTH_PATH}/refresh`,
    data: {
      encodedOAuthRefreshToken: personalAccessKey,
    },
    params: portalId ? { portalId } : {},
  });

  return axios<AccessTokenResponse>({
    ...axiosConfig,
    method: 'post',
  });
}

export function fetchScopeData(
  accountId: number,
  scopeGroup: string
): AxiosPromise<ScopeData> {
  return http.get<ScopeData>(accountId, {
    url: `${LOCALDEVAUTH_API_AUTH_PATH}/check-scopes`,
    params: { scopeGroup },
  });
}

export function fetchAppInstallationData(
  portalId: number,
  projectId: number,
  appUid: string,
  requiredScopeGroups: Array<string>,
  optionalScopeGroups: Array<string> = []
): AxiosPromise<PublicAppInstallationData> {
  return http.post<PublicAppInstallationData>(portalId, {
    url: `${LOCALDEVAUTH_API_AUTH_PATH}/install-info`,
    data: {
      portalId,
      projectId,
      sourceId: appUid,
      requiredScopeGroups,
      optionalScopeGroups,
    },
  });
}
