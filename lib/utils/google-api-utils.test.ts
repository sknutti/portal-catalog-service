import { SerialDate } from '@lib/utils/google-api-utils';

test('Correctly serializes dates', () => {
    let date = new Date(Date.UTC(2020, 6, 15, 18, 33));
    expect(SerialDate.fromJSDate(date)).toEqual(44027.77291666667);
    expect(SerialDate.toJSDate(44027.77291666667).getTime()).toEqual(date.getTime());

    date = new Date(Date.UTC(2020, 6, 15, 18, 33, 19));
    expect(SerialDate.fromJSDate(date)).toEqual(44027.77313657408);
    expect(SerialDate.toJSDate(44027.77313657408).getTime()).toEqual(date.getTime());

    date = new Date(Date.UTC(2024, 1, 29)); // A leap day
    expect(SerialDate.toJSDate(45351).getTime()).toEqual(date.getTime());
    expect(SerialDate.fromJSDate(date)).toEqual(45351);
});


test('Correctly serializes times', () => {
    expect(SerialDate.fromTime('12:00 AM')).toEqual(0);
    expect(SerialDate.toTime(0)).toEqual('12:00 AM');

    expect(SerialDate.fromTime('12:00 PM')).toEqual(0.5);
    expect(SerialDate.toTime(0.5)).toEqual('12:00 PM');

    expect(SerialDate.fromTime('1:13 PM')).toEqual(0.5506944444444445);
    expect(SerialDate.toTime(0.5506944444444445)).toEqual('1:13 PM');

    expect(SerialDate.fromTime('1:13 AM')).toEqual(0.050694444444444445);
    expect(SerialDate.toTime(0.050694444444444445)).toEqual('1:13 AM');

    expect(SerialDate.fromTime('11:45 PM')).toEqual(0.9895833333333334);
    expect(SerialDate.toTime(0.9895833333333334)).toEqual('11:45 PM');

    expect(SerialDate.fromTime('11:45 AM')).toEqual(0.4895833333333333);
    expect(SerialDate.toTime(0.4895833333333333)).toEqual('11:45 AM');
});
