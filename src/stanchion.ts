import {
    Observable,
    Observer,
    Subject,
    Subscription,
} from 'rxjs';
import * as Redis from 'redis';

import {
    Options,
    ConstructOptions,
    ObservableProcessor,
    PromiseProcessor,
    ErrorHandler,
    VoidFunction,
    Stanchion as StanchionContract,
} from '../typings';
import Connection from './connection';
import {
    UnexpectError,
    ConnectionError,
    DisconnectingError,
    ShutdownedError,
} from './exception';
import {
    isBoolean,
    noop,
    randomInArray,
    shuffleArray,
} from './helper';


/**
 * Default options.
 */
const defaultOptions: Options = {
    redis: {
        host: '127.0.0.1',
        port: 6739,
    },
    concurrency: 10,
    redisKey: 'stanchion_queue',
    retryAttempts: 6,
};

/**
 * 
 */
const overwriteRedisOptions: Redis.ClientOpts = {
    return_buffers: false,
    retry_unfulfilled_commands: false,
    enable_offline_queue: true,
    detect_buffers: false,
};


/**
 * Stanchion
 */
class Stanchion implements StanchionContract {

    protected shutdowned = false;

    protected options: Options;
    protected redisOptions: Redis.ClientOpts;
    protected workerConnections: Connection[];
    protected controlConnection: Connection;

    protected error$: Subject<any>;
    protected shutdowned$: Subject<any>;

    protected useSingleRedisKey: boolean;
    protected redisKeys: string[];

    protected roundNumberForPush: number = 0;

    /**
     * 
     * @param {Options} options 
     */
    constructor(options: ConstructOptions) {
        const mergedOptions = {
            ...defaultOptions,
            ...options,
        };

        if (typeof mergedOptions.redisKey === 'string') {
            this.useSingleRedisKey === true;
            this.redisKeys = [mergedOptions.redisKey];
        } else {
            this.useSingleRedisKey = mergedOptions.redisKey.length === 1;
            this.redisKeys = mergedOptions.redisKey;
        }

        if (mergedOptions.concurrency < this.redisKeys.length) {
            throw new Error(`concurrency must be greater than or equal to the total of Redis keys.`);
        }

        this.options = mergedOptions;
        this.redisOptions = {
            ...mergedOptions.redis,
            ...overwriteRedisOptions,
        };
        this.workerConnections = [];
        this.error$ = new Subject();
        this.shutdowned$ = new Subject();
    }

    /**
     * 
     */
    protected makeConnection(): Connection {
        const connection = new Connection(this.redisOptions, this.options.retryAttempts);

        connection.onDisconnecting$().subscribe(() => {
            if (this.shutdowned === false) {
                this.error$.next(new DisconnectingError(`Connection disconnected.`));
            }
        });

        return connection;
    }

    /**
     * 
     */
    protected getControlConnection(): Connection {
        if (this.controlConnection === undefined) {
            this.controlConnection = this.makeConnection();

            // If control Connection been cutted, Stanchion must be shutdowned.
            this.controlConnection.onCutted$()
                .filter(isBoolean(true))
                .subscribe(() => {
                    if (this.shutdowned === false) {
                        this.error$.next(new ConnectionError(`Control connection has been cutted`));
                        this.shutdown$().subscribe({
                            // Supress any error that may occur.
                            error: noop,
                        });
                    }
                });
        }

        return this.controlConnection;
    }

    /**
     * 
     */
    protected makeShutdownedException$() {
        return Observable.throw(new ShutdownedError(`Stanchion been shutdowned.`));
    }

    /**
     * 
     * @param {...any} jobs 
     */
    push(...jobs: any[]): Promise<void> {
        return this.push$(...jobs).toPromise();
    }

    /**
     * 
     * @param {...any} jobs 
     */
    push$(...jobs: any[]): Observable<void> {
        if (this.shutdowned) {
            return this.makeShutdownedException$();
        }

        const connection = this.getControlConnection();
        const rpush$ = Observable.bindNodeCallback<string, string, string>(connection.redis.rpush.bind(connection.redis));

        const pushedReplies$ = jobs.map(job => rpush$(this.getRedisKeyForPush(), JSON.stringify(job)));

        return Observable.forkJoin(...pushedReplies$).mapTo(void 0);
    }

    /**
     * 
     * @param total 
     */
    protected getRedisKey(total: number): string {
        return this.useSingleRedisKey === true ?
            this.redisKeys[0] :
            this.redisKeys[(total % this.redisKeys.length)];
    }

    /**
     * 
     */
    protected getRedisKeyForPush(): string {
        this.roundNumberForPush = (this.roundNumberForPush + 1) % this.redisKeys.length;

        return this.getRedisKey(this.roundNumberForPush);
    }

    /**
     * 
     */
    getSize(): Promise<number> {
        return this.getSize$().toPromise();
    }

    /**
     * 
     */
    getSize$(): Observable<number> {
        if (this.shutdowned) {
            return this.makeShutdownedException$();
        }

        const connection = this.getControlConnection();
        const redisKeys = this.getAllRedisKeys();
        const llen$ = Observable.bindNodeCallback<string, number>(connection.redis.llen.bind(connection.redis));
        const sources = redisKeys.map(redisKey => llen$(redisKey));

        return Observable.forkJoin(sources)
            .map(lengths => lengths.reduce((sum, length) => sum + length), 0);
    }

    /**
     * 
     */
    onError(handler: ErrorHandler): Subscription {
        return this.onError$().subscribe(handler, handler);
    }

    /**
     * 
     */
    onError$() {
        return this.error$;
    }

    /**
     * 
     */
    protected getAllRedisKeys(): string[] {
        return this.redisKeys;
    }

    /**
     * 
     */
    protected getRedisKeyTotal(): number {
        return this.redisKeys.length;
    }

    /**
     * 
     * @param {ObservableProcessor} processor
     */
    protected react(processor: ObservableProcessor): Observable<void> {
        if (this.shutdowned) {
            return this.makeShutdownedException$();
        }

        const self = this;

        return Observable.create((observer: Observer<void>) => {
            const maxTicketCount = self.options.concurrency;
            let availableTicketCount = maxTicketCount;
            const buffer$ = new Subject<object>();
            const done$ = new Subject<void>();
            const fetching$ = new Subject<void>();

            // Make a new connection for every processor.
            //
            const connection = this.makeConnection();

            const blpop$ = Observable.bindNodeCallback<string, number, [string, string]>(connection.redis.blpop.bind(connection.redis));
            self.workerConnections.push(connection);

            // When `Buffer$` emits a job, process it.
            //
            const onBufferSub = buffer$
                .mergeMap(processor).subscribe({
                    next: () => {
                        done$.next();
                    },
                    error: (err: any) => {
                        self.error$.next(err);
                        done$.next();
                    },
                });

            //
            // Main loop: fetch & done.
            //

            const onDoneSub = done$
                .subscribe(() => {
                    availableTicketCount++;

                    if (connection.redis.connected === true) {
                        fetching$.next();
                    }
                });

            const redisKeyTotal = this.getRedisKeyTotal();
            const onFetchingSub = fetching$
                .scan(num => (num + 1) % redisKeyTotal, 0)
                .subscribe((num) => {
                    if (availableTicketCount <= 0) {
                        return void self.error$.next(new UnexpectError(`over fetching`));
                    }

                    availableTicketCount--;

                    blpop$(this.getRedisKey(num), 0).subscribe({
                        next: function unserializeJob([, serialized]) {
                            try {
                                buffer$.next(JSON.parse(serialized));
                            } catch (err) {
                                self.error$.next(err);
                                done$.next();
                            }
                        },
                        error: (err) => {
                            self.error$.next(err);
                            done$.next();
                        },
                    });
                });

            //
            // Monitor connection to start processing.
            //

            const onConnectionReadySub = connection.onReady$()
                .subscribe({
                    next: () => {
                        Observable.range(1, availableTicketCount).subscribe(() => fetching$.next());
                    },
                    error: (err) => {
                        self.error$.next(err);
                    },
                });

            const onConnectionErrorSub = connection.onError$()
                .subscribe(err => {
                    self.error$.next(err);
                });

            const onConnectionCuttedSub = connection.onCutted$()
                .filter(isBoolean(true))
                .subscribe(() => {
                    const err = new Error(`connection cutted`);

                    self.error$.next(err);
                    observer.error(err);
                });

            //
            // Destructing function.
            //

            return () => {
                onDoneSub.unsubscribe();
                onFetchingSub.unsubscribe();
                onBufferSub.unsubscribe();
                onConnectionReadySub.unsubscribe();
                onConnectionErrorSub.unsubscribe();
                onConnectionCuttedSub.unsubscribe();

                connection.cut$(false).subscribe();
            };
        });
    }

    /**
     * 
     * @param {PromiseProcessor} processor
     */
    process(processor: PromiseProcessor): Promise<void> {
        const wrappedProcessor: ObservableProcessor = (job: object) => {
            return Observable.fromPromise(processor(job));
        };

        return this.react(wrappedProcessor).toPromise();
    }

    /**
     * 
     * @param {ObservableProcessor} processor
     */
    process$(processor: ObservableProcessor): Observable<void> {
        return this.react(processor);
    }

    /**
     * 
     */
    shutdown(): Promise<void> {
        return this.shutdown$().toPromise();
    }

    /**
     * 
     */
    shutdown$(): Observable<void> {
        try {
            if (this.shutdowned) {
                return this.makeShutdownedException$();
            }

            this.shutdowned = true;
            this.shutdowned$.next();
            this.shutdowned$.complete();

            const cutWorkerConnections$ = this.workerConnections.map(connection => connection.cut$(true));
            const cutControlConnection$ = this.controlConnection === undefined ?
                Observable.empty() :
                this.controlConnection.cut$(true);

            return Observable.forkJoin(
                ...cutWorkerConnections$,
                cutControlConnection$,
            )
                .mapTo(void 0);
        } catch (err) {
            return Observable.throw(err);
        }
    }

    /**
     * 
     */
    isShutdowned(): boolean {
        return this.shutdowned;
    }

    /**
     * 
     * @param {VoidFunction} cb
     */
    onShutdowned(cb: VoidFunction): Subscription {
        return this.onShutdowned$().subscribe(cb);
    }

    /**
     * 
     */
    onShutdowned$(): Observable<void> {
        return this.shutdowned$;
    }

}

export {
    Stanchion,
};