import { Subject, Observable } from 'rxjs';
import { take, filter } from 'rxjs/operators';

export class AsyncChainQueue<TAsyncInput, SAsyncOutput, RKnownArgs> {
    private pipeline: Promise<SAsyncOutput>;
    private queueLength: number = 0;
    private tasksComplete: number = 0;
    private queueIsClosed: boolean = false;

    private taskComplete: Subject<void> = new Subject<void>();
    private queueComplete: Observable<void> = this.taskComplete.pipe(filter(x => this.queueLength === this.tasksComplete));
    private openQueueSignal: Subject<void> = new Subject<void>();

    // If there is a sequence of closures and re-openings, we need to manage them properly.
    private numberOfClosures: number = 0;
    private numberOfOpenings: number = 0;

    constructor(initialValue: SAsyncOutput, startQueueClosed: boolean = false) {
        this.pipeline = Promise.resolve(initialValue);

        if (startQueueClosed) {
            this.closeQueue();
        }
    }

    public get IsClosed(): boolean {
        return this.queueIsClosed;
    }

    // Takes a synchronous function, wraps it in a Promise so that it can be added to the queue. If necessary, takes a timeout.
    public pushFunctionToQueue(knownArgs: RKnownArgs, createInputToTask: (s: SAsyncOutput, r: RKnownArgs) => TAsyncInput, callback: (t: TAsyncInput) => SAsyncOutput, timeoutInMS: number = 0) {
        this.queueLength++;

        this.pipeline = new Promise<SAsyncOutput>((resolve, reject) => {
            this.pipeline.then((s: SAsyncOutput) => {
                setTimeout(() => {
                    const input = createInputToTask(s, knownArgs);
                    const output = callback(input);
                    resolve(output);
                }, timeoutInMS);
            });
        }).then(s => this.registerTaskCompletion(s));
    }

    // asyncTask will run at the earliest possible time.
    public pushPromiseToQueue(knownArgs: RKnownArgs, createInputToTask: (s: SAsyncOutput, r: RKnownArgs) => TAsyncInput, promise: (t: TAsyncInput) => Promise<SAsyncOutput>) {
        this.queueLength++;
        this.pipeline = this.pipeline.
            then((s: SAsyncOutput) => createInputToTask(s, knownArgs)).
            then(input => promise(input)).
            then(s => this.registerTaskCompletion(s));
    }

    public closeQueueAndGetFinalResult(): Promise<SAsyncOutput> {
        const promiseToReturn: Promise<SAsyncOutput> = this.pipeline;
        this.closeQueue();
        return promiseToReturn;
    }

    // Does not resolve until all tasks in the queue are complete, including tasks that have not yet been added
    public getFinalResultAndCloseWhenAllTasksComplete(): Promise<SAsyncOutput> {
        if (this.queueLength === this.tasksComplete) {
            return new Promise<SAsyncOutput>((resolve, reject) => {
                // Needs to return the pipeline as it is, but still add a closure promise to the chain.
                const copyOfPipeline: Promise<SAsyncOutput> = this.pipeline.then(s => s);
                this.closeQueue();
                resolve(copyOfPipeline);
            });
        }

        return new Promise<SAsyncOutput>((resolve, reject) => {
            this.queueComplete.pipe(take(1)).subscribe(() => {
                const copyOfPipeline: Promise<SAsyncOutput> = this.pipeline.then(s => s);
                this.closeQueue();
                copyOfPipeline.then(s => resolve(s));
            });
        });

    }

    // Once the queue is open, it will always run to completion. It cannot be stopped halfway.
    public openQueue(): void {
        if (this.numberOfOpenings <= this.numberOfClosures) {
            this.numberOfOpenings++;
        }

        this.openQueueSignal.next();
        this.queueIsClosed = false;
    }

    private closeQueue(): void {
        if (this.queueIsClosed) {
            return;
        }

        this.numberOfClosures++;
        const closureNumber = this.numberOfClosures;

        this.pipeline = new Promise<SAsyncOutput>((resolve, reject) => {
            this.pipeline.then(s => {
                if (closureNumber <= this.numberOfOpenings) {
                    resolve(s);
                }

                this.openQueueSignal.subscribe(() => resolve(s));
            });
        });

        this.queueIsClosed = true;
    }

    private registerTaskCompletion(resultOfTask: SAsyncOutput): Promise<SAsyncOutput> {
        this.tasksComplete++;
        this.taskComplete.next();
        return Promise.resolve(resultOfTask);
    }
}
