import {
    Observable,
    Subject,
    Subscription,
} from 'rxjs';


export interface RedisOptions {
    host?: string,
    port?: number,
    path?: string,
    url?: string,
    auth_pass?: string,
    password?: string,
    db?: string,
    family?: string,
    tls?: any,
    prefix?: string,
}

export interface Options {
    redis: RedisOptions,
    concurrency: number,
    redisKey: string | string[],
    retryAttempts: number,
}

export type ConstructOptions = {
    [K in keyof Options]?: Options[K];
}

export interface PromiseProcessor {
    (job: object): Promise<void>;
}

export interface ObservableProcessor {
    (job: object): Observable<void>;
}

export interface ErrorHandler {
    (err: any): void;
}

export interface VoidFunction {
    (): void;
}

declare class Stanchion {
    constructor(options: ConstructOptions);

    push(...jobs: any[]): Promise<void>;
    push$(...jobs: any[]): Observable<void>;
    getSize(): Promise<number>;
    getSize$(): Observable<number>;
    onError(handler: ErrorHandler): Subscription;
    onError$(): Subject<any>;
    process(processor: PromiseProcessor): Promise<void>;
    process$(processor: ObservableProcessor): Observable<void>;
    shutdown(): Promise<void>;
    shutdown$(): Observable<void>;
    isShutdowned(): boolean;
    onShutdowned(cb: VoidFunction): Subscription;
    onShutdowned$(): Observable<void>;
}
