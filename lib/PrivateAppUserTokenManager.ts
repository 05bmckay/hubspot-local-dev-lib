import {
  fetchPrivateAppUserToken,
  createPrivateAppUserToken,
  updatePrivateAppUserToken,
  PrivateAppUserTokenResponse,
} from '../api/privateAppUserToken';
import { scopeGroupsForPersonalAccessKey } from './personalAccessKey';
import { logger } from './logger';
import { i18n } from '../utils/lang';
import moment from 'moment';
import { AxiosError, isAxiosError } from 'axios';
import { getAxiosErrorWithContext } from '../errors/apiErrors';
import { throwErrorWithMessage } from '../errors/standardErrors';
import { BaseError } from '../types/Error';

const USER_TOKEN_READ = 'developer.private_app.temporary_token.read';
const USER_TOKEN_WRITE = 'developer.private_app.temporary_token.write';
const i18nKey = 'lib.PrivateAppUserTokenManager';

export class PrivateAppUserTokenManager {
  accountId: number;
  private tokenMap: Map<number, PrivateAppUserTokenResponse>;
  private tokenMapIntervalId: Map<number, NodeJS.Timeout>;
  private enabled: boolean;

  constructor(accountId: number) {
    this.accountId = accountId;
    this.tokenMap = new Map<number, PrivateAppUserTokenResponse>();
    this.tokenMapIntervalId = new Map<number, NodeJS.Timeout>();
    this.enabled = false;
  }

  async init(): Promise<void> {
    const scopeGroups = new Set<string>(
      await scopeGroupsForPersonalAccessKey(this.accountId)
    );
    if (
      !scopeGroups.has(USER_TOKEN_READ) ||
      !scopeGroups.has(USER_TOKEN_WRITE)
    ) {
      throwErrorWithMessage(`${i18nKey}.errors.noScopes`, {
        accountId: this.accountId,
      });
    } else {
      logger.debug(
        i18n(`${i18nKey}.enabled`, {
          accountId: this.accountId,
        })
      );
      this.enabled = true;
    }
  }

  cleanup() {
    this.tokenMapIntervalId.forEach(timeoutId => clearInterval(timeoutId));
    this.tokenMapIntervalId.clear();
    this.tokenMap.clear();
  }

  async getPrivateAppToken(
    appId: number,
    scopeGroups: string[] = []
  ): Promise<string | undefined> {
    if (!this.enabled) {
      logger.debug(
        i18n(`${i18nKey}.disabled`, {
          accountId: this.accountId,
          appId: appId,
        })
      );
      return;
    }
    try {
      if (
        this.tokenMap.has(appId) &&
        PrivateAppUserTokenManager.doesTokenHaveAllScopes(
          this.tokenMap.get(appId),
          scopeGroups
        )
      ) {
        logger.debug(
          i18n(`${i18nKey}.cached`, {
            appId: appId,
          })
        );
        return this.tokenMap.get(appId)!.userTokenKey;
      } else {
        const token = await this.createOrGetActiveToken(appId, scopeGroups);
        this.setCacheAndRefresh(appId, token, scopeGroups);
        return token.userTokenKey;
      }
    } catch (err) {
      let messageDetail = 'Unknown error';
      if (isAxiosError(err)) {
        messageDetail = getAxiosErrorWithContext(err as AxiosError).message;
      } else if (err instanceof Error) {
        messageDetail = err.message;
      }
      throwErrorWithMessage(
        `${i18nKey}.errors.apiError`,
        {
          accountId: this.accountId,
          appId: appId,
          messageDetail: messageDetail,
        },
        isAxiosError(err) ? undefined : (err as BaseError) // Only pass the error if it's not an AxiosError, api error message is good enough
      );
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private setCacheAndRefresh(
    appId: number,
    token: PrivateAppUserTokenResponse,
    scopeGroups: string[]
  ) {
    if (token === undefined || token === null) {
      throwErrorWithMessage(`${i18nKey}.errors.refreshFailed`, {
        accountId: this.accountId,
        appId: appId,
      });
    }
    this.tokenMap.set(appId, token);
    if (this.tokenMapIntervalId.has(appId)) {
      clearInterval(this.tokenMapIntervalId.get(appId));
    }
    const now = moment.utc();
    const refreshDelayMillis = Math.max(
      moment
        .utc(token.expiresAt)
        .subtract(5, 'minutes')
        .diff(now, 'milliseconds'),
      0
    );
    this.tokenMapIntervalId.set(
      appId,
      setInterval(
        () => this.refreshToken(appId, token.userTokenKey, scopeGroups),
        refreshDelayMillis
      )
    );
    logger.debug(
      i18n(`${i18nKey}.refreshScheduled`, {
        appId: appId,
        expiresAt: token.expiresAt,
        refreshTime: now.add(refreshDelayMillis, 'milliseconds').toISOString(),
      })
    );
  }

  private async createOrGetActiveToken(
    appId: number,
    scopeGroups: string[]
  ): Promise<PrivateAppUserTokenResponse> {
    const maybeToken = await this.getExistingToken(appId);
    if (maybeToken === null) {
      logger.debug(
        i18n(`${i18nKey}.create`, {
          appId: appId,
        })
      );
      return createPrivateAppUserToken(this.accountId, appId, scopeGroups);
    } else if (
      moment
        .utc()
        .add(5, 'minutes')
        .isAfter(moment.utc(maybeToken.expiresAt)) ||
      !PrivateAppUserTokenManager.doesTokenHaveAllScopes(
        maybeToken,
        scopeGroups
      )
    ) {
      logger.debug(
        i18n(`${i18nKey}.refresh`, {
          appId: appId,
        })
      );
      return updatePrivateAppUserToken(
        this.accountId,
        appId,
        maybeToken.userTokenKey,
        scopeGroups
      );
    }
    return maybeToken;
  }

  private static doesTokenHaveAllScopes(
    token: PrivateAppUserTokenResponse | undefined,
    requestedScopes: string[]
  ): boolean {
    if (token === undefined) {
      return false;
    }
    return requestedScopes.every(scopeGroup =>
      token.scopeGroups.includes(scopeGroup)
    );
  }

  private async getExistingToken(
    appId: number
  ): Promise<PrivateAppUserTokenResponse | null> {
    try {
      return await fetchPrivateAppUserToken(this.accountId, appId);
    } catch (err) {
      if (isAxiosError(err)) {
        if (err.response?.status == 404) {
          return null;
        }
      }
      throw err;
    }
  }

  private async refreshToken(
    appId: number,
    userTokenKey: string,
    scopeGroups: string[]
  ) {
    logger.debug(
      i18n(`${i18nKey}.refresh`, {
        appId: appId,
      })
    );
    const newToken = await updatePrivateAppUserToken(
      this.accountId,
      appId,
      userTokenKey,
      scopeGroups
    );
    if (newToken) {
      this.setCacheAndRefresh(appId, newToken, scopeGroups);
    } else {
      throwErrorWithMessage(`${i18nKey}.errors.refreshFailed`, {
        accountId: this.accountId,
        appId: appId,
      });
    }
  }
}