import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/** Keeps enough of an address to tell hops apart (e.g. "203.0.x.x"), not enough to identify a person. */
export function maskIp(ip: string | undefined): string {
  if (!ip) return '(none)';
  const v4 = ip.replace(/^::ffff:/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return v4.split('.').slice(0, 2).join('.') + '.x.x';
  const groups = ip.split(':').filter(Boolean);
  return groups.length ? `${groups.slice(0, 2).join(':')}:…` : ip;
}

/**
 * Deployment check (LOG_CLIENT_IP_ONCE=on): logs, once, how many addresses arrive in X-Forwarded-For and
 * which one Express takes as the client with the current TRUST_PROXY — so TRUST_PROXY can be set to the
 * number of proxies in front of the API. Addresses are masked. Turn it off again afterwards.
 */
export function clientIpProbe(logger = new Logger('ClientIp')) {
  let done = false;
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!done && req.path !== '/health') {
      done = true;
      const header = req.headers['x-forwarded-for'];
      const chain = (Array.isArray(header) ? header.join(',') : (header ?? '')).split(',').map((s) => s.trim()).filter(Boolean);
      logger.log(
        `X-Forwarded-For has ${chain.length} entr${chain.length === 1 ? 'y' : 'ies'} [${chain.map(maskIp).join(', ')}]; ` +
          `socket ${maskIp(req.socket.remoteAddress)}; TRUST_PROXY=${process.env.TRUST_PROXY || 0} → client ${maskIp(req.ip)}`,
      );
    }
    next();
  };
}
