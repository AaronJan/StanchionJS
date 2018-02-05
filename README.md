<h1 align=center>
    <img alt="StanchionJS" src="https://aaronjan.github.io/StanchionJS/docs/logo-by-freepik.png">
    <br>
    StanchionJS
</h1>


<p align=center>
<a href="https://www.npmjs.com/package/stanchionjs"><img src="https://img.shields.io/npm/v/stanchionjs.svg?style=flat" alt="npm version"></a>
</p>


A simple & fast queue done right. backed by Redis, supports auto-reconnect, TypeScript, Promise and Rxjs.


## Features

- **Fast.** Just `BLPOP` and `RPUSH`, no other fancy stuff, simple and fast.

- **Auto-Reconnect.**

- **Works with Promise.** Unleash the power of `async / await`, say bye-bye to callback.

- **Better error handling.**

- **Written in TypeScript.** No hacky code and provides better experience if you are using `TypeScript`.

- **Reactive.** If you don't like making promises, there're reactive APIs too, all APIs have two versions.


## Installation

```
$ npm i stanchionjs
```


## Examples

### Initialize

```javascript
const { Stanchion } = require('stanchionjs');

const stanchion = new Stanchion({
    redis: {
        host: '127.0.0.1',
        port: 6379,
        db: '1',
    },
    concurrency: 20,
});

```


### How To Create a Job

```javascript
const { Stanchion } = require('stanchionjs');

const stanchion = new Stanchion();

// Payload will be serialized using `JSON.stringify`
const job_1 = {
    thing: 'apple',
};
const job_2 = {
    thing: 'banana',
};

//
// Promise way:
//

stanchion.push(job_1, job_2).then(() => {
    console.log('jobs created.');
});

//
// Rxjs way:
//

stanchion.push$(job_1, job_2).subscribe(() => {
    console.log('jobs created.');
});

```


### How To Process a Job

When a Job processing is done, you must tell `StanchionJS` so it can go fetching next Job for you. `StanchionJS` provides several ways to do that:

```javascript
const { Stanchion } = require('stanchionjs');
const { Observable } = require('rxjs'); // Not required.

const stanchion = new Stanchion();

//
// Promise way:
//

stanchion.process(job => new Promise((resolve, reject) => {
    console.log('Got a job:', job);

    resolve();
}));

//
// Async / Await way:
//

stanchion.process(async job => {
    console.log('Got a job:', job);
});

//
// Rxjs way:
//

stanchion.process$(
    job => Observable.of(job)
        .map(job => {
            console.log('Got a job:', job);
        })
).subscribe(); // Don't forget to subscribe!

```


### Error Handling

Every exception (including those from `redis`) can be obtained by attach handler to `Stanchion` instance:

```javascript
const { Stanchion } = require('stanchionjs');

const stanchion = new Stanchion();

//
// Callback handler:
//

stanchion.onError(err => {
    console.log('error occurred', err);
});

//
// Rxjs stream:
//

stanchion.onError$().subscribe(err => {
    console.log('error occurred', err);
});

```


### How To Exit

```javascript
const { Stanchion } = require('stanchionjs');

const stanchion = new Stanchion();

//
// Promise way:
//

stanchion.shutdown().then(() => {
    console.log('Stanchion exited.');
});

//
// Rxjs way:
//

stanchion.shutdown$().subscribe(() => {
    console.log('Stanchion exited.');
});

```


### When Exited

```javascript
const { Stanchion } = require('stanchionjs');

const stanchion = new Stanchion();

//
// Promise way:
//

stanchion.onShutdowned(() => {
    console.log('Stanchion exited.');
});

//
// Rxjs way:
//

stanchion.onShutdowned$().subscribe(() => {
    console.log('Stanchion exited.');
});

```


## Reference

### Interfaces

#### ConstructOptions

Default value:

```javascript
{
    // Redis configuration.
    redis: {
        host: '127.0.0.1',
        port: 6739,
    },

    // If you have lots of I/O intensive jobs, increase this may help.
    concurrency: 10,
    
    // Redis key for this queue.
    // Stanchion also support multiple keys, just use:
    //   rediskey: ['stanchion_queue1', 'stanchion_queue2']
    redisKey: 'stanchion_queue',
    
    // How many times you want Stanchion to try reconnecting when connection is lost.
    retryAttempts: 6,
}
```


### Stanchion

#### Stanchion#constructor

```typescript
constructor(options: ConstructOptions)
```

#### Stanchion#push

```typescript
push(...jobs: any[]): Promise<void>
```

#### Stanchion#push$

```typescript
push$(...jobs: any[]): Observable<void>
```

#### Stanchion#getSize

```typescript
getSize(): Promise<number>
```

#### Stanchion#getSize$

```typescript
getSize$(): Observable<number>
```

#### Stanchion#onError

```typescript
onError(handler: ErrorHandler): Subscription
```

#### Stanchion#onError$

```typescript
onError$(): Subject<any>
```

#### Stanchion#process

```typescript
process(processor: PromiseProcessor): Promise<void>
```

#### Stanchion#process$

```typescript
process$(processor: ObservableProcessor): Observable<void>
```

#### Stanchion#shutdown

```typescript
shutdown(): Promise<void>
```

#### Stanchion#shutdown$

```typescript
shutdown$(): Observable<void>
```

#### Stanchion#isShutdowned

```typescript
isShutdowned(): boolean
```

#### Stanchion#onShutdowned

```typescript
onShutdowned(cb: VoidFunction): Subscription
```

#### Stanchion#onShutdowned$

```typescript
onShutdowned$(): Observable<void>
```


## TODOs

- Tests. Although Stanchion is bettle-tested, handling about 26K jobs per second.

- Multiple queue (Redis key) support.

- "unprocess" method.

- Key-sharding support for cluster usage.


## Credits

Awesome icon by [Freepik](http://www.freepik.com), licensed under the [Creative Commons BY 3.0](http://creativecommons.org/licenses/by/3.0/).

Inspired by [Neamar/featureless-job-queue](https://github.com/Neamar/featureless-job-queue).
