export function *batch<T>(iterable: Iterable<T>, batchSize: number): Generator<Generator<T>> {
    const iterator = iterable[Symbol.iterator]();

    function *innerBatch(firstItem: T): Generator<T> {
        yield firstItem;

        let count = 1;
        if (batchSize === 1) {
            return;
        }

        let i = iterator.next();
        while (!i.done) {
            yield i.value;
            count++;

            if (count == batchSize) {
                return;
            }

            i = iterator.next();
        }
    }

    let item = iterator.next();
    while (!item.done) {
        yield innerBatch(item.value);
        item = iterator.next();
    }
}

export function filter<T, U extends T>(iterator: IterableIterator<T>, predicate: (item: T) => item is U): Generator<U>;
export function filter<T>(iterator: IterableIterator<T>, predicate: (item: T) => boolean): Generator<T>;
export function *filter<T, U extends T>(iterator: IterableIterator<T>, predicate: (item: T) => boolean): Generator<U | T> {
    for (const item of iterator) {
        if (predicate(item)) {
            yield item;
        }
    }
}

export function collect<T>(iterator: IterableIterator<T>): T[] {
    const result: T[] = [];

    for (const item of iterator) {
        result.push(item);
    }

    return result;
}

export function *enumerate<T>(iterator: IterableIterator<T>, startIdx= 0): Generator<[item: T, index: number]> {
    let i = startIdx;
    for (const item of iterator) {
        yield [item, i];
        i++;
    }
}

export function *map<T, U>(iterator: IterableIterator<T>, mapper: (item: T) => U): Generator<U> {
    for (const item of iterator) {
        yield mapper(item);
    }
}
