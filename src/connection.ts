import {
    Observable,
    Observer,
    Subject,
    BehaviorSubject,
} from 'rxjs';
import * as Redis from 'redis';

import {
    isBoolean,
} from './helper';


/**
 * Connection
 */
class Connection {

    readonly redis: Redis.RedisClient;

    protected connected$: BehaviorSubject<boolean>;
    protected cutted$: BehaviorSubject<boolean>;
    protected ready$: Subject<void>;
    protected disconnecting$: Subject<void>;
    protected error$: Subject<any>;

    /**
     * 
     * @param {Redis.ClientOpts} redisOptions
     * @param {number} maxRetryTime 
     */
    constructor(redisOptions: Redis.ClientOpts, maxRetryTime = 10) {
        this.initializeStream();

        const self = this;

        const gaveUpReconnecting$ = new BehaviorSubject(false);

        // When Connection gave up reconnecting and `connected$` is false, we can declare 
        // this Connection is been Cutted.
        //
        gaveUpReconnecting$.filter(isBoolean(true))
            .mergeMapTo(self.connected$.filter(isBoolean(false)))
            .subscribe(() => {
                self.cutted$.next(true);
            });

        const finalRedisOptions: Redis.ClientOpts = {
            ...redisOptions,
            retry_strategy: (options: Redis.RetryStrategyOptions) => {
                if (options.attempt > maxRetryTime) {
                    gaveUpReconnecting$.next(true);

                    return new Error(`too many Redis reconnecting attempts`);
                }

                return Math.min(options.attempt * 500, 3000);
            },
        };

        const redis = Redis.createClient(finalRedisOptions);
        redis.on('ready', () => {
            self.connected$.next(true);
            self.ready$.next();
        });
        redis.on('end', () => {
            self.connected$.next(false);
            self.disconnecting$.next();
        });
        redis.on('error', (err) => {
            self.error$.next(err);
        });
        this.redis = redis;
    }

    /**
     * 
     */
    protected initializeStream() {
        this.connected$ = new BehaviorSubject(false);
        this.cutted$ = new BehaviorSubject(false);
        this.ready$ = new Subject();
        this.disconnecting$ = new Subject();
        this.error$ = new Subject();
    }

    /**
     * 
     * @param {Redis.RedisClient} redis
     * @param {boolean} graceful
     */
    protected disconnectRedis$(redis: Redis.RedisClient, graceful: boolean): Observable<void> {
        if (redis.connected === false) {
            return Observable.of(void 0);
        }

        if (graceful) {
            return Observable.create((observer: Observer<void>) => {
                redis.quit(() => {
                    observer.next(void 0);
                    observer.complete();
                });
            });
        } else {
            redis.end(true);

            return Observable.of(void 0);
        }
    }

    /**
     * 
     */
    cut$(graceful = true): Observable<void> {
        try {
            return this.disconnectRedis$(this.redis, graceful)
                .do(() => {
                    this.cutted$.next(true);
                });
        } catch (err) {
            return Observable.throw(err);
        }
    }

    /**
     * 
     */
    getRedis() {
        return this.redis;
    }

    /**
     * 
     */
    onConnected$() {
        return this.connected$;
    }

    /**
     * 
     */
    onCutted$() {
        return this.cutted$;
    }

    /**
     * 
     */
    onReady$() {
        return this.ready$;
    }

    /**
     * 
     */
    onDisconnecting$() {
        return this.disconnecting$;
    }

    /**
     * 
     */
    onError$() {
        return this.error$;
    }

}

export default Connection;

export {
    Connection,
};
