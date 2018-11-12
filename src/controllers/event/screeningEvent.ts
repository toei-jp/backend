/**
 * 上映イベントコントローラー
 */
import * as chevre from '@toei-jp/chevre-api-nodejs-client';
import * as createDebug from 'debug';
import { NextFunction, Request, Response } from 'express';
import { BAD_REQUEST, NO_CONTENT } from 'http-status';
import * as moment from 'moment';

import User from '../../user';

const debug = createDebug('chevre-backend:controllers');

const DEFAULT_OFFERS_VALID_AFTER_START_IN_MINUTES = -30;

export async function index(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const ticketTypeService = new chevre.service.TicketType({
            endpoint: <string>process.env.API_ENDPOINT,
            auth: req.user.authClient
        });
        const placeService = new chevre.service.Place({
            endpoint: <string>process.env.API_ENDPOINT,
            auth: req.user.authClient
        });
        const searchMovieTheatersResult = await placeService.searchMovieTheaters({});
        if (searchMovieTheatersResult.totalCount === 0) {
            throw new Error('劇場が見つかりません');
        }
        const searchTicketTypeGroupsResult = await ticketTypeService.searchTicketTypeGroups({});
        res.render('events/screeningEvent/index', {
            movieTheaters: searchMovieTheatersResult.data,
            moment: moment,
            ticketGroups: searchTicketTypeGroupsResult.data
        });
    } catch (err) {
        next(err);
    }
}
export async function search(req: Request, res: Response): Promise<void> {
    const ticketTypeService = new chevre.service.TicketType({
        endpoint: <string>process.env.API_ENDPOINT,
        auth: req.user.authClient
    });
    const eventService = new chevre.service.Event({
        endpoint: <string>process.env.API_ENDPOINT,
        auth: req.user.authClient
    });
    const placeService = new chevre.service.Place({
        endpoint: <string>process.env.API_ENDPOINT,
        auth: req.user.authClient
    });
    try {
        const date = req.query.date;
        const days = req.query.days;
        const screen = req.query.screen;
        const movieTheater = await placeService.findMovieTheaterByBranchCode({ branchCode: req.query.theater });
        const searchResult = await eventService.searchScreeningEvents({
            eventStatuses: [chevre.factory.eventStatusType.EventScheduled],
            inSessionFrom: moment(`${date}T00:00:00+09:00`, 'YYYYMMDDTHH:mm:ssZ').toDate(),
            inSessionThrough: moment(`${date}T00:00:00+09:00`, 'YYYYMMDDTHH:mm:ssZ').add(days, 'day').toDate(),
            superEvent: {
                locationBranchCodes: [movieTheater.branchCode]
            }
        });
        let data: typeof searchResult.data;
        let screens: typeof movieTheater.containsPlace;
        if (screen !== undefined) {
            data = searchResult.data.filter((event) => event.location.branchCode === screen);
            if (searchResult.data.length < searchResult.totalCount) {
                let dataPage2: typeof searchResult.data;
                const searchResultPage2 = await eventService.searchScreeningEvents({
                    eventStatuses: [chevre.factory.eventStatusType.EventScheduled],
                    inSessionFrom: moment(`${date}T00:00:00+09:00`, 'YYYYMMDDTHH:mm:ssZ').toDate(),
                    inSessionThrough: moment(`${date}T00:00:00+09:00`, 'YYYYMMDDTHH:mm:ssZ').add(days, 'day').toDate(),
                    superEvent: {
                        locationBranchCodes: [movieTheater.branchCode]
                    },
                    page: 2
                });
                dataPage2 = searchResultPage2.data.filter((event) => event.location.branchCode === screen);
                for (const dataP2 of dataPage2) {
                    data.push(dataP2);
                }
            }
            screens = (
                <typeof movieTheater.containsPlace>
                movieTheater.containsPlace.filter((place) => place.branchCode === screen)
            );
        } else {
            data = searchResult.data;
            screens = movieTheater.containsPlace;
        }
        const searchTicketTypeGroupsResult = await ticketTypeService.searchTicketTypeGroups({});
        res.json({
            validation: null,
            error: null,
            performances: data,
            screens,
            ticketGroups: searchTicketTypeGroupsResult.data
        });
    } catch (err) {
        debug('search error', err);
        res.json({
            validation: null,
            error: err.message
        });
    }
}
/**
 * 作品検索
 */
export async function searchScreeningEventSeries(req: Request, res: Response): Promise<void> {
    const eventService = new chevre.service.Event({
        endpoint: <string>process.env.API_ENDPOINT,
        auth: req.user.authClient
    });
    try {
        const searchResult = await eventService.searchScreeningEventSeries({
            location: {
                branchCodes: [req.query.movieTheaterBranchCode]
            },
            workPerformed: {
                identifiers: [req.query.identifier]
            }
        });
        res.json({
            validation: null,
            error: null,
            screeningEventSeries: searchResult.data
        });
    } catch (err) {
        debug('searchScreeningEvent error', err);
        res.json({
            validation: null,
            error: err.message
        });
    }
}
/**
 * 新規登録
 */
export async function regist(req: Request, res: Response): Promise<void> {
    try {
        const eventService = new chevre.service.Event({
            endpoint: <string>process.env.API_ENDPOINT,
            auth: req.user.authClient
        });
        addValidation(req);
        const validatorResult = await req.getValidationResult();
        const validations = req.validationErrors(true);
        if (!validatorResult.isEmpty()) {
            res.json({
                validation: validations,
                error: null
            });

            return;
        }

        debug('saving screening event...', req.body);
        const attributes = await createMultipleEventFromBody(req.body, req.user);
        await eventService.createMultipleScreeningEvent(attributes);
        res.json({
            validation: null,
            error: null
        });
    } catch (err) {
        debug('regist error', err);
        const obj = {
            validation: null,
            error: err.message
        };
        if (err.code === BAD_REQUEST) {
            res.status(err.code).json(obj);
        } else {
            res.json(obj);
        }
    }
}
/**
 * 更新
 */
export async function update(req: Request, res: Response): Promise<void> {
    try {
        const eventService = new chevre.service.Event({
            endpoint: <string>process.env.API_ENDPOINT,
            auth: req.user.authClient
        });
        updateValidation(req);
        const validatorResult = await req.getValidationResult();
        const validations = req.validationErrors(true);
        if (!validatorResult.isEmpty()) {
            res.json({
                validation: validations,
                error: null
            });

            return;
        }
        debug('saving screening event...', req.body);
        const attributes = await createEventFromBody(req.body, req.user);
        await eventService.updateScreeningEvent({
            id: req.params.eventId,
            attributes: attributes
        });
        res.json({
            validation: null,
            error: null
        });
    } catch (err) {
        debug('update error', err);
        res.json({
            validation: null,
            error: err.message
        });
    }
}

/**
 * 物理削除ではなくイベントキャンセル
 */
export async function cancelPerformance(req: Request, res: Response): Promise<void> {
    try {
        const eventService = new chevre.service.Event({
            endpoint: <string>process.env.API_ENDPOINT,
            auth: req.user.authClient
        });
        const event = await eventService.findScreeningEventById({ id: req.params.eventId });
        if (moment(event.startDate).tz('Asia/Tokyo').isSameOrAfter(moment().tz('Asia/Tokyo'), 'day')) {
            event.eventStatus = chevre.factory.eventStatusType.EventCancelled;
            await eventService.updateScreeningEvent({ id: event.id, attributes: event });

            res.json({
                validation: null,
                error: null
            });
        } else {
            res.json({
                validation: null,
                error: '開始日時'
            });
        }
    } catch (err) {
        debug('delete error', err);
        res.status(NO_CONTENT).json({
            validation: null,
            error: err.message
        });
    }
}

/**
 * リクエストボディからイベントオブジェクトを作成する
 */
async function createEventFromBody(body: any, user: User): Promise<chevre.factory.event.screeningEvent.IAttributes> {
    const eventService = new chevre.service.Event({
        endpoint: <string>process.env.API_ENDPOINT,
        auth: user.authClient
    });
    const placeService = new chevre.service.Place({
        endpoint: <string>process.env.API_ENDPOINT,
        auth: user.authClient
    });
    const screeningEventSeries = await eventService.findScreeningEventSeriesById({
        id: body.screeningEventId
    });
    const movieTheater = await placeService.findMovieTheaterByBranchCode({ branchCode: body.theater });
    const screeningRoom = movieTheater.containsPlace.find((p) => p.branchCode === body.screen);
    if (screeningRoom === undefined) {
        throw new Error('上映スクリーンが見つかりません');
    }
    if (screeningRoom.name === undefined) {
        throw new Error('上映スクリーン名が見つかりません');
    }

    const offersValidAfterStart = (body.endSaleTimeAfterScreening !== undefined && body.endSaleTimeAfterScreening !== '')
        ? Number(body.endSaleTimeAfterScreening)
        : DEFAULT_OFFERS_VALID_AFTER_START_IN_MINUTES;
    const startDate = moment(`${body.day}T${body.startTime}+09:00`, 'YYYYMMDDTHHmmZ').toDate();
    const salesStartDate = moment(`${body.saleStartDate}T${body.saleStartTime}+09:00`, 'YYYYMMDDTHHmmZ').toDate();
    const salesEndDate = moment(startDate).add(offersValidAfterStart, 'minutes').toDate();
    const onlineDisplayStartDate = moment(`${body.onlineDisplayStartDate}T00:00:00+09:00`, 'YYYYMMDDTHH:mm:ssZ').toDate();
    let acceptedPaymentMethod: chevre.factory.paymentMethodType[] | undefined;
    // ムビチケ除外の場合は対応決済方法を追加
    if (body.mvtkExcludeFlg === '1') {
        Object.keys(chevre.factory.paymentMethodType).forEach((key) => {
            if (acceptedPaymentMethod === undefined) {
                acceptedPaymentMethod = [];
            }
            const paymentMethodType = (<any>chevre.factory.paymentMethodType)[key];
            if (paymentMethodType !== chevre.factory.paymentMethodType.MovieTicket) {
                acceptedPaymentMethod.push(paymentMethodType);
            }
        });
    }

    const offers: chevre.factory.event.screeningEvent.IOffer = {
        typeOf: 'Offer',
        priceCurrency: chevre.factory.priceCurrency.JPY,
        availabilityEnds: salesEndDate,
        availabilityStarts: onlineDisplayStartDate,
        eligibleQuantity: {
            typeOf: 'QuantitativeValue',
            unitCode: chevre.factory.unitCode.C62,
            maxValue: Number(body.maxSeatNumber),
            value: 1
        },
        validFrom: salesStartDate,
        validThrough: salesEndDate,
        acceptedPaymentMethod: acceptedPaymentMethod
    };

    return {
        typeOf: chevre.factory.eventType.ScreeningEvent,
        doorTime: moment(`${body.day}T${body.doorTime}+09:00`, 'YYYYMMDDTHHmmZ').toDate(),
        startDate: startDate,
        endDate: moment(`${body.day}T${body.endTime}+09:00`, 'YYYYMMDDTHHmmZ').toDate(),
        ticketTypeGroup: body.ticketTypeGroup,
        workPerformed: screeningEventSeries.workPerformed,
        location: {
            typeOf: <chevre.factory.placeType.ScreeningRoom>screeningRoom.typeOf,
            branchCode: <string>screeningRoom.branchCode,
            name: screeningRoom.name,
            alternateName: screeningRoom.alternateName,
            address: screeningRoom.address
        },
        superEvent: screeningEventSeries,
        name: screeningEventSeries.name,
        eventStatus: chevre.factory.eventStatusType.EventScheduled,
        offers: offers,
        checkInCount: <any>undefined,
        attendeeCount: <any>undefined
    };
}
/**
 * リクエストボディからイベントオブジェクトを作成する
 */
async function createMultipleEventFromBody(body: any, user: User): Promise<chevre.factory.event.screeningEvent.IAttributes[]> {
    const eventService = new chevre.service.Event({
        endpoint: <string>process.env.API_ENDPOINT,
        auth: user.authClient
    });
    const placeService = new chevre.service.Place({
        endpoint: <string>process.env.API_ENDPOINT,
        auth: user.authClient
    });
    const screeningEventSeries = await eventService.findScreeningEventSeriesById({
        id: body.screeningEventId
    });
    const movieTheater = await placeService.findMovieTheaterByBranchCode({ branchCode: body.theater });
    const screeningRoom = movieTheater.containsPlace.find((p) => p.branchCode === body.screen);
    if (screeningRoom === undefined) {
        throw new Error('上映スクリーンが見つかりません');
    }
    if (screeningRoom.name === undefined) {
        throw new Error('上映スクリーン名が見つかりません');
    }

    const startDate = moment(`${body.startDate}T00:00:00+09:00`, 'YYYYMMDDTHHmmZ').tz('Asia/Tokyo');
    const toDate = moment(`${body.toDate}T00:00:00+09:00`, 'YYYYMMDDTHHmmZ').tz('Asia/Tokyo');
    const weekDays: string[] = body.weekDayData;
    const ticketTypes: string[] = body.ticketData;
    const mvtkExcludeFlgs: string[] = body.mvtkExcludeFlgData;
    const timeData: { doorTime: string; startTime: string; endTime: string }[] = body.timeData;
    const attributes: chevre.factory.event.screeningEvent.IAttributes[] = [];
    for (let date = startDate; date <= toDate; date = date.add(1, 'day')) {
        const formattedDate = date.format('YYYY/MM/DD');
        const day = date.get('day').toString();
        if (weekDays.indexOf(day) >= 0) {
            timeData.forEach((data, i) => {
                const offersValidAfterStart = (body.endSaleTimeAfterScreening !== undefined && body.endSaleTimeAfterScreening !== '')
                    ? Number(body.endSaleTimeAfterScreening)
                    : DEFAULT_OFFERS_VALID_AFTER_START_IN_MINUTES;
                const eventStartDate = moment(`${formattedDate}T${data.startTime}+09:00`, 'YYYYMMDDTHHmmZ').toDate();
                const salesStartDate = moment(`${formattedDate}T0000+09:00`, 'YYYYMMDDTHHmmZ')
                    .add(parseInt(body.saleStartDays, 10) * -1, 'day').toDate();
                const salesEndDate = moment(eventStartDate).add(offersValidAfterStart, 'minutes').toDate();
                const onlineDisplayStartDate = moment(`${body.onlineDisplayStartDate}T00:00:00+09:00`, 'YYYYMMDDTHH:mm:ssZ').toDate();
                let acceptedPaymentMethod: chevre.factory.paymentMethodType[] | undefined;
                // ムビチケ除外の場合は対応決済方法を追加
                if (mvtkExcludeFlgs[i] === '1') {
                    Object.keys(chevre.factory.paymentMethodType).forEach((key) => {
                        if (acceptedPaymentMethod === undefined) {
                            acceptedPaymentMethod = [];
                        }
                        const paymentMethodType = (<any>chevre.factory.paymentMethodType)[key];
                        if (paymentMethodType !== chevre.factory.paymentMethodType.MovieTicket) {
                            acceptedPaymentMethod.push(paymentMethodType);
                        }
                    });
                }

                const offers: chevre.factory.event.screeningEvent.IOffer = {
                    typeOf: 'Offer',
                    priceCurrency: chevre.factory.priceCurrency.JPY,
                    availabilityEnds: salesEndDate,
                    availabilityStarts: onlineDisplayStartDate,
                    eligibleQuantity: {
                        typeOf: 'QuantitativeValue',
                        unitCode: chevre.factory.unitCode.C62,
                        maxValue: Number(body.maxSeatNumber),
                        value: 1
                    },
                    validFrom: salesStartDate,
                    validThrough: salesEndDate,
                    acceptedPaymentMethod: acceptedPaymentMethod
                };

                attributes.push({
                    typeOf: chevre.factory.eventType.ScreeningEvent,
                    doorTime: moment(`${formattedDate}T${data.doorTime}+09:00`, 'YYYYMMDDTHHmmZ').toDate(),
                    startDate: eventStartDate,
                    endDate: moment(`${formattedDate}T${data.endTime}+09:00`, 'YYYYMMDDTHHmmZ').toDate(),
                    ticketTypeGroup: ticketTypes[i],
                    workPerformed: screeningEventSeries.workPerformed,
                    location: {
                        typeOf: <chevre.factory.placeType.ScreeningRoom>screeningRoom.typeOf,
                        branchCode: <string>screeningRoom.branchCode,
                        name: screeningRoom.name === undefined ? { en: '', ja: '', kr: '' } : screeningRoom.name,
                        alternateName: screeningRoom.alternateName,
                        address: screeningRoom.address
                    },
                    superEvent: screeningEventSeries,
                    name: screeningEventSeries.name,
                    eventStatus: chevre.factory.eventStatusType.EventScheduled,
                    offers: offers,
                    checkInCount: <any>undefined,
                    attendeeCount: <any>undefined
                });
            });
        }
    }

    return attributes;
}
/**
 * 新規登録バリデーション
 */
function addValidation(req: Request): void {
    req.checkBody('screeningEventId', '上映イベントシリーズが未選択です').notEmpty();
    req.checkBody('startDate', '上映日が未選択です').notEmpty();
    req.checkBody('toDate', '上映日が未選択です').notEmpty();
    req.checkBody('weekDayData', '曜日が未選択です').notEmpty();
    req.checkBody('screen', 'スクリーンが未選択です').notEmpty();
    req.checkBody('theater', '劇場が未選択です').notEmpty();
    req.checkBody('timeData', '時間情報が未選択です').notEmpty();
    req.checkBody('ticketData', '券種グループが未選択です').notEmpty();
}
/**
 * 編集バリデーション
 */
function updateValidation(req: Request): void {
    req.checkBody('screeningEventId', '上映イベントシリーズが未選択です').notEmpty();
    req.checkBody('day', '上映日が未選択です').notEmpty();
    req.checkBody('doorTime', '開場時間が未選択です').notEmpty();
    req.checkBody('startTime', '開始時間が未選択です').notEmpty();
    req.checkBody('endTime', '終了時間が未選択です').notEmpty();
    req.checkBody('screen', 'スクリーンが未選択です').notEmpty();
    req.checkBody('ticketTypeGroup', '券種グループが未選択です').notEmpty();
}
