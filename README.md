# Async Chain Demo

This app demonstrates a TypeScript library that allows web forms to be processed sequentially and asynchronously. For example, if a high-traffic retail website needs to process many requests, it needs to do them in order if it has limited inventory and may sell out. It is surprisingly difficult to do this in JavaScript, especially in a way that:

1. Handles cancellations cleanly after a task is submitted, and
2. Allows forms to still be submitted after the first form or forms have started processing. 

The central data structure is the AsyncChainQueue class. The Queue is built from the `Promise` class, using a Kleisli arrow category pattern to build categorical chains. The project is hosted at https://tearlant.github.io/async-chain-demo/

------------------------------------

To build and run...

```
npm install
ng build
ng serve (or 'ng serve --open' to open a browser immediately)
```

The example is served at localhost:4200

------------------------------------

In the demo, there is a simplified webfrom with two fields: one to take a 'value' and one to take a 'time' (in seconds)

A task waits 'time' and then adds 'value' to the displayed running total. Clicking 'Submit Task'
adds a task to the queue. For example, if a task is currently processing, and you submit a task
with 'value' 4 and 'time' 5, then after all tasks are finished, the page will wait 5 seconds and
increment the running total by 4.

It is easier to see what is going on by submitting tasks with "long" times (5+ seconds). You
can still submit tasks while the task(s) in the queue are processing.

The elapsed timer is to prove that the UI is still updating while the tasks are running asynchronously.

Clicking the Halt buttons will allow the user to play with the functionality of the OPEN/CLOSED mechanism.
The queue can be in either a "closed" or an "open" state. A closed queue can take new tasks, but will not start
running until the queue is opened.

Resetting will flush the queue.

------------------------------------

The source code for the `AsyncChainQueue` data structure is in `src\app\queue\asyncChainQueue.ts`

This is a templated class, `AsyncChainQueue<TAsyncInput, SAsyncOutput, RKnownArgs>`,
which for simplicity of notation will be denoted `AsyncChainQueue<T, S, R>`.

```

                            |                            |
                            | R                          |
                            | g:S,R --> T                | f: T --> Promise<S>
                            |                            |
                            v                            v
                        ---------                    ---------
                       |         |                  |         |
                  S    |         |        T         |         |
             --------->|    g    |----------------->|    f    |--------
            |          |         |                  |         |        |
            |          |         |                  |         |        |
            |           ---------                    ---------         |
            |                                                          |
            |                                                          |
            |                                                          |
             ----------------------------------------------------------

```
	
A task (`f`) is a function that takes a `T` and returns a `Promise<S>`. A KleisliAsyncQueue can either take
- a function with the signature `T -> Promise<S>` (via `pushPromiseToQueue`), or
- a function that the signature `T -> S` and a timeout (via `pushFunctionToQueue`) that will be wrapped in a Promise.

Conceptually, each task requires arguments that can either be known ahead of time (`R`) and arguments that depend on
the result of the previous task (`S`). `g` is a callback that maps an `R` and an `S` to a `T`, so that the next task can take
a `T` as its input.

So each time a task is pushed to the queue, it also requires a of callback to map a `(S, R)` to a `T`, as well as an instance of `R`.

------------------------------------

Within `src\app\app.component.ts`, we use a `AsyncChainQueue<InputToTask, number, DataFromForm>`.

In other words,

```
T = InputToTask, { runningTotal: number, increment: number, delayInMilliseconds: number }
S = number
R = DataFromForm, { taskValue: number, taskTimeInSeconds: number }
```

The function `g` is createArgumentsForTask, which takes the output of the last task (the running total) and the arguments in a `DataFromForm`.
It also needs to convert seconds to milliseconds, as this is what setTimeout takes.

The function `f` is `promiseToPushToQueue`, which does the incrementation and updates the display asynchronously.

Every time "Submit Task" is clicked, a new task is pushed to the `AsyncChainQueue`.
