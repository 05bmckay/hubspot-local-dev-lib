import { HubSpotAuthError } from './HubSpotAuthError';
import { i18n } from '../utils/lang';

import { BaseError, StatusCodeError } from '../types/Error';

export function isSystemError(err: BaseError): boolean {
  return err.errno != null && err.code != null && err.syscall != null;
}

export function isFatalError(err: BaseError): boolean {
  return err instanceof HubSpotAuthError;
}

function genericThrowErrorWithMessage(
  ErrorType: ErrorConstructor,
  identifier: string,
  interpolation?: { [key: string]: string | number },
  cause?: BaseError
): never {
  const message = i18n(`errors.${identifier}`, interpolation);
  if (cause) {
    throw new ErrorType(message, { cause });
  }
  throw new ErrorType(message);
}

/**
 * @throws
 */
export function throwErrorWithMessage(
  identifier: string,
  interpolation?: { [key: string]: string | number },
  cause?: BaseError
): never {
  genericThrowErrorWithMessage(Error, identifier, interpolation, cause);
}

/**
 * @throws
 */
export function throwTypeErrorWithMessage(
  identifier: string,
  interpolation?: { [key: string]: string | number },
  cause?: BaseError
): never {
  genericThrowErrorWithMessage(TypeError, identifier, interpolation, cause);
}

/**
 * @throws
 */
export function throwAuthErrorWithMessage(
  identifier: string,
  interpolation?: { [key: string]: string | number },
  cause?: BaseError
): never {
  genericThrowErrorWithMessage(
    // @ts-expect-error HubSpotAuthError is not callable
    HubSpotAuthError,
    identifier,
    interpolation,
    cause
  );
}

function throwStatusCodeError(error: StatusCodeError): never {
  const { statusCode, message, response } = error as StatusCodeError;
  const errorData = JSON.stringify({
    statusCode,
    message,
    url: response.request.href,
    method: response.request.method,
    response: response.body,
    headers: response.headers,
  });
  throw new Error(errorData, { cause: error });
}

/**
 * @throws
 */
export function throwError(error: BaseError): never {
  if (error.name === 'StatusCodeError') {
    throwStatusCodeError(error as StatusCodeError);
  } else {
    // Error or Error subclass
    const name = error.name || 'Error';
    const message = [i18n('errors.errorTypes.generic', { name })];
    [error.message, error.reason].forEach(msg => {
      if (msg) {
        message.push(msg);
      }
    });
    throw new Error(message.join(' '), { cause: error });
  }
}