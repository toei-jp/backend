/**
 * 上映イベントシリーズコントローラー
 */
import * as chevre from '@chevre/api-nodejs-client';
import * as createDebug from 'debug';
import { Request, Response } from 'express';
import { INTERNAL_SERVER_ERROR } from 'http-status';
import * as moment from 'moment-timezone';
import * as _ from 'underscore';

import * as Message from '../../common/Const/Message';

const debug = createDebug('chevre-backend:controllers');

// 1ページに表示するデータ数
// const DEFAULT_LINES: number = 10;
// 作品コード 半角64
const NAME_MAX_LENGTH_CODE: number = 64;
// 作品名・日本語 全角64
const NAME_MAX_LENGTH_NAME_JA: number = 64;

/**
 * 新規登録
 */
export async function add(req: Request, res: Response): Promise<void> {
    const creativeWorkService = new chevre.service.CreativeWork({
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

    const searchMoviesResult = await creativeWorkService.searchMovies({
        sort: {
            datePublished: chevre.factory.sortType.Descending
        },
        project: { ids: [req.project.id] },
        offers: {
            availableFrom: new Date()
        }
    });
    const movies = searchMoviesResult.data;

    const searchMovieTheatersResult = await placeService.searchMovieTheaters({
        project: { ids: [req.project.id] }
    });

    let message = '';
    let errors: any = {};
    if (req.method === 'POST') {
        // バリデーション
        validate(req);
        const validatorResult = await req.getValidationResult();
        errors = req.validationErrors(true);
        if (validatorResult.isEmpty()) {
            // 作品DB登録
            try {
                const searchResult = await creativeWorkService.searchMovies({
                    project: { ids: [req.project.id] },
                    identifier: req.body.workPerformed.identifier
                });
                const movie = searchResult.data.shift();
                if (movie === undefined) {
                    throw new Error(`Movie ${req.query.identifier} Not Found`);
                }

                const movieTheater = await placeService.findMovieTheaterById({ id: req.body.locationId });
                req.body.contentRating = movie.contentRating;
                const attributes = createEventFromBody(req, movie, movieTheater, true);
                debug('saving an event...', attributes);
                const events = await eventService.create<chevre.factory.eventType.ScreeningEventSeries>(attributes);
                req.flash('message', '登録しました');
                res.redirect(`/events/screeningEventSeries/${events[0].id}/update`);

                return;
            } catch (error) {
                message = error.message;
            }
        } else {
            message = '入力に誤りがあります';
        }
    }

    const forms = {
        headline: {},
        workPerformed: {},
        videoFormatType: [],
        ...req.body
    };

    // 作品マスタ画面遷移
    debug('errors:', errors);
    res.render('events/screeningEventSeries/add', {
        message: message,
        errors: errors,
        forms: forms,
        movies: movies,
        movieTheaters: searchMovieTheatersResult.data,
        VideoFormatType: chevre.factory.videoFormatType
    });
}
/**
 * 編集
 */
// tslint:disable-next-line:cyclomatic-complexity max-func-body-length
export async function update(req: Request, res: Response): Promise<void> {
    const creativeWorkService = new chevre.service.CreativeWork({
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

    const searchMoviesResult = await creativeWorkService.searchMovies({
        sort: {
            datePublished: chevre.factory.sortType.Descending
        },
        project: { ids: [req.project.id] },
        offers: {
            availableFrom: new Date()
        }
    });

    const searchMovieTheatersResult = await placeService.searchMovieTheaters({
        project: { ids: [req.project.id] }
    });

    let message = '';
    let errors: any = {};
    const eventId = req.params.eventId;
    const event = await eventService.findById<chevre.factory.eventType.ScreeningEventSeries>({
        id: eventId
    });

    if (req.method === 'POST') {
        // バリデーション
        validate(req);
        const validatorResult = await req.getValidationResult();
        errors = req.validationErrors(true);
        if (validatorResult.isEmpty()) {
            // 作品DB登録
            try {
                const searchResult = await creativeWorkService.searchMovies({
                    project: { ids: [req.project.id] },
                    identifier: req.body.workPerformed.identifier
                });
                const movie = searchResult.data.shift();
                if (movie === undefined) {
                    throw new Error(`Movie ${req.query.identifier} Not Found`);
                }

                const movieTheater = await placeService.findMovieTheaterById({ id: req.body.locationId });
                req.body.contentRating = movie.contentRating;
                const attributes = createEventFromBody(req, movie, movieTheater, false);
                debug('saving an event...', attributes);
                await eventService.update({
                    id: eventId,
                    attributes: attributes
                });
                req.flash('message', '更新しました');
                res.redirect(req.originalUrl);

                return;
            } catch (error) {
                message = error.message;
            }
        } else {
            message = '入力に誤りがあります';
        }
    }

    let mvtkFlg = 1;
    if (event.offers !== undefined
        && Array.isArray(event.offers.acceptedPaymentMethod)
        && event.offers.acceptedPaymentMethod.indexOf(chevre.factory.paymentMethodType.MovieTicket) < 0) {
        mvtkFlg = 0;
    }

    let translationType = '';
    if (event.subtitleLanguage !== undefined && event.subtitleLanguage !== null) {
        translationType = '0';
    }
    if (event.dubLanguage !== undefined && event.dubLanguage !== null) {
        translationType = '1';
    }
    const additionalProperty = (event.additionalProperty !== undefined) ? event.additionalProperty : [];
    const signageDisplayName = additionalProperty.find((p) => p.name === 'signageDisplayName');
    const signageDislaySubtitleName = additionalProperty.find((p) => p.name === 'signageDislaySubtitleName');
    const summaryStartDay = additionalProperty.find((p) => p.name === 'summaryStartDay');

    const forms = {
        headline: {},
        ...event,
        signageDisplayName: (signageDisplayName !== undefined) ? signageDisplayName.value : '',
        signageDislaySubtitleName: (signageDislaySubtitleName !== undefined) ? signageDislaySubtitleName.value : '',
        summaryStartDay: (summaryStartDay !== undefined) ? summaryStartDay.value : '',
        ...req.body,
        nameJa: (_.isEmpty(req.body.nameJa)) ? event.name.ja : req.body.nameJa,
        nameEn: (_.isEmpty(req.body.nameEn)) ? event.name.en : req.body.nameEn,
        duration: (_.isEmpty(req.body.duration)) ? moment.duration(event.duration).asMinutes() : req.body.duration,
        locationId: event.location.id,
        translationType: translationType,
        videoFormatType: (Array.isArray(event.videoFormat)) ? event.videoFormat.map((f) => f.typeOf) : [],
        startDate: (_.isEmpty(req.body.startDate)) ?
            (event.startDate !== null) ? moment(event.startDate).tz('Asia/Tokyo').format('YYYY/MM/DD') : '' :
            req.body.startDate,
        endDate: (_.isEmpty(req.body.endDate)) ?
            (event.endDate !== null) ? moment(event.endDate).tz('Asia/Tokyo').add(-1, 'day').format('YYYY/MM/DD') : '' :
            req.body.endDate,
        mvtkFlg: (_.isEmpty(req.body.mvtkFlg)) ? mvtkFlg : req.body.mvtkFlg
    };

    // 作品マスタ画面遷移
    debug('errors:', errors);
    res.render('events/screeningEventSeries/edit', {
        message: message,
        errors: errors,
        forms: forms,
        movies: searchMoviesResult.data,
        movieTheaters: searchMovieTheatersResult.data,
        VideoFormatType: chevre.factory.videoFormatType
    });
}
/**
 * 作品 - レイティング
 */
export async function getRating(req: Request, res: Response): Promise<void> {
    try {
        const creativeWorkService = new chevre.service.CreativeWork({
            endpoint: <string>process.env.API_ENDPOINT,
            auth: req.user.authClient
        });
        const searchResult = await creativeWorkService.searchMovies({
            project: { ids: [req.project.id] },
            identifier: req.query.identifier
        });
        const movie = searchResult.data.shift();
        if (movie === undefined) {
            throw new Error(`Movie ${req.query.identifier} Not Found`);
        }

        res.json({
            success: true,
            results: movie.contentRating
        });
    } catch (error) {
        res.json({
            success: false,
            count: 0,
            results: []
        });
    }
}

/**
 * リクエストボディからイベントオブジェクトを作成する
 */
// tslint:disable-next-line:max-func-body-length
function createEventFromBody(
    req: Request,
    movie: chevre.factory.creativeWork.movie.ICreativeWork,
    movieTheater: chevre.factory.place.movieTheater.IPlace,
    isNew: boolean
): chevre.factory.event.screeningEventSeries.IAttributes {
    const body = req.body;

    const videoFormat = (Array.isArray(body.videoFormatType)) ? body.videoFormatType.map((f: string) => {
        return { typeOf: f, name: f };
    }) : [];
    const soundFormat = (Array.isArray(body.soundFormatType)) ? body.soundFormatType.map((f: string) => {
        return { typeOf: f, name: f };
    }) : [];

    let acceptedPaymentMethod: chevre.factory.paymentMethodType[] | undefined;
    // ムビチケ除外の場合は対応決済方法を追加
    Object.keys(chevre.factory.paymentMethodType).forEach((key) => {
        if (acceptedPaymentMethod === undefined) {
            acceptedPaymentMethod = [];
        }

        const paymentMethodType = (<any>chevre.factory.paymentMethodType)[key];
        if (body.mvtkFlg !== '1' && paymentMethodType === chevre.factory.paymentMethodType.MovieTicket) {
            return;
        }

        acceptedPaymentMethod.push(paymentMethodType);
    });

    const offers: chevre.factory.event.screeningEventSeries.IOffer = {
        project: { typeOf: req.project.typeOf, id: req.project.id },
        typeOf: chevre.factory.offerType.Offer,
        priceCurrency: chevre.factory.priceCurrency.JPY,
        acceptedPaymentMethod: acceptedPaymentMethod
    };

    let subtitleLanguage: chevre.factory.language.ILanguage | undefined;
    if (body.translationType === '0') {
        subtitleLanguage = { typeOf: 'Language', name: 'Japanese' };
    }

    let dubLanguage: chevre.factory.language.ILanguage | undefined;
    if (body.translationType === '1') {
        dubLanguage = { typeOf: 'Language', name: 'Japanese' };
    }

    if (typeof movie.duration !== 'string') {
        throw new Error('作品の上映時間が未登録です');
    }

    return {
        project: req.project,
        typeOf: chevre.factory.eventType.ScreeningEventSeries,
        name: {
            ja: body.nameJa,
            en: body.nameEn,
            kr: ''
        },
        kanaName: body.kanaName,
        location: {
            project: req.project,
            id: movieTheater.id,
            typeOf: <chevre.factory.placeType.MovieTheater>movieTheater.typeOf,
            branchCode: movieTheater.branchCode,
            name: movieTheater.name,
            kanaName: movieTheater.kanaName
        },
        // organizer: {
        //     typeOf: OrganizationType.MovieTheater,
        //     identifier: params.movieTheater.identifier,
        //     name: params.movieTheater.name
        // },
        videoFormat: videoFormat,
        soundFormat: soundFormat,
        workPerformed: movie,
        duration: movie.duration,
        startDate: (!_.isEmpty(body.startDate)) ? moment(`${body.startDate}T00:00:00+09:00`, 'YYYY/MM/DDTHH:mm:ssZ').toDate() : undefined,
        endDate: (!_.isEmpty(body.endDate))
            ? moment(`${body.endDate}T00:00:00+09:00`, 'YYYY/MM/DDTHH:mm:ssZ').add(1, 'day').toDate()
            : undefined,
        eventStatus: chevre.factory.eventStatusType.EventScheduled,
        headline: {
            ja: <string>body.headline.ja,
            en: ''
        },
        additionalProperty: [
            {
                name: 'signageDisplayName',
                value: body.signageDisplayName
            },
            {
                name: 'signageDislaySubtitleName',
                value: body.signageDislaySubtitleName
            },
            {
                name: 'summaryStartDay',
                value: body.summaryStartDay
            }
        ],
        offers: offers,
        description: {
            ja: body.description,
            en: '',
            kr: ''
        },
        ...(subtitleLanguage !== undefined) ? { subtitleLanguage } : undefined,
        ...(dubLanguage !== undefined) ? { dubLanguage } : undefined,
        ...(!isNew)
            ? {
                $unset: {
                    ...(subtitleLanguage === undefined) ? { subtitleLanguage: 1 } : undefined,
                    ...(dubLanguage === undefined) ? { dubLanguage: 1 } : undefined
                }
            }
            : undefined
    };
}
/**
 * 検索API
 */
export async function search(req: Request, res: Response): Promise<void> {
    try {
        const eventService = new chevre.service.Event({
            endpoint: <string>process.env.API_ENDPOINT,
            auth: req.user.authClient
        });
        const branchCode = <string | undefined>req.query.branchCode;
        const fromDate = <string | undefined>req.query.fromDate;
        const toDate = <string | undefined>req.query.toDate;
        if (branchCode === undefined) {
            throw new Error();
        }
        // 上映終了して「いない」劇場上映作品を検索
        const limit = 100;
        const page = 1;
        const { data } = await eventService.search({
            limit: limit,
            page: page,
            project: { ids: [req.project.id] },
            typeOf: chevre.factory.eventType.ScreeningEventSeries,
            inSessionFrom: (fromDate !== undefined) ? moment(`${fromDate}T23:59:59+09:00`, 'YYYYMMDDTHH:mm:ssZ').toDate() : new Date(),
            inSessionThrough: (toDate !== undefined) ? moment(`${toDate}T00:00:00+09:00`, 'YYYYMMDDTHH:mm:ssZ').toDate() : undefined,
            location: {
                branchCodes: [branchCode]
            }
        });
        const results = data.map((event) => {
            let mvtkFlg = 1;
            if (event.offers !== undefined && Array.isArray(event.offers.acceptedPaymentMethod)
                && event.offers.acceptedPaymentMethod.indexOf(chevre.factory.paymentMethodType.MovieTicket) < 0) {
                mvtkFlg = 0;
            }

            let translationType = '';
            if (event.subtitleLanguage !== undefined && event.subtitleLanguage !== null) {
                translationType = '字幕';
            }
            if (event.dubLanguage !== undefined && event.dubLanguage !== null) {
                translationType = '吹替';
            }

            return {
                ...event,
                id: event.id,
                filmNameJa: <string>event.name.ja,
                filmNameEn: <string>event.name.en,
                kanaName: event.kanaName,
                duration: moment.duration(event.duration).humanize(),
                contentRating: event.workPerformed.contentRating,
                translationType: translationType,
                videoFormat: event.videoFormat,
                mvtkFlg: mvtkFlg
            };
        });
        results.sort((event1, event2) => {
            if (event1.filmNameJa > event2.filmNameJa) {
                return 1;
            }
            if (event1.filmNameJa < event2.filmNameJa) {
                return -1;
            }

            return 0;
        });
        res.json({
            success: true,
            count: (data.length === Number(limit))
                ? (Number(page) * Number(limit)) + 1
                : ((Number(page) - 1) * Number(limit)) + Number(data.length),
            results: results
        });
    } catch (_) {
        res.json({
            success: false,
            count: 0,
            results: []
        });
    }
}
/**
 * 劇場作品のスケジュール検索
 */
export async function searchScreeningEvents(req: Request, res: Response) {
    try {
        const eventService = new chevre.service.Event({
            endpoint: <string>process.env.API_ENDPOINT,
            auth: req.user.authClient
        });
        const searchScreeningEventsResult = await eventService.search({
            ...req.query,
            project: { ids: [req.project.id] },
            typeOf: chevre.factory.eventType.ScreeningEvent,
            superEvent: { ids: [req.params.eventId] }
        });
        res.json(searchScreeningEventsResult);
    } catch (error) {
        res.status(INTERNAL_SERVER_ERROR).json({ error: { message: error.message } });
    }
}
/**
 * 一覧データ取得API
 */
export async function getList(req: Request, res: Response): Promise<void> {
    try {
        const eventService = new chevre.service.Event({
            endpoint: <string>process.env.API_ENDPOINT,
            auth: req.user.authClient
        });

        const limit = Number(req.query.limit);
        const page = Number(req.query.page);
        const { data } = await eventService.search({
            limit: limit,
            page: page,
            project: { ids: [req.project.id] },
            typeOf: chevre.factory.eventType.ScreeningEventSeries,
            name: req.query.name,
            endFrom: (req.query.containsEnded === '1') ? undefined : new Date(),
            location: {
                branchCodes: (req.query.locationBranchCode !== '') ? [req.query.locationBranchCode] : undefined
            },
            workPerformed: {
                identifiers: (req.query.movieIdentifier !== '') ? [req.query.movieIdentifier] : undefined
            }
        });

        const results = data.map((event) => {
            let translationType = '';
            if (event.subtitleLanguage !== undefined && event.subtitleLanguage !== null) {
                translationType = '字幕';
            }
            if (event.dubLanguage !== undefined && event.dubLanguage !== null) {
                translationType = '吹替';
            }

            return {
                ...event,
                translationType: translationType,
                startDay: (event.startDate !== undefined) ? moment(event.startDate).tz('Asia/Tokyo').format('YYYY/MM/DD') : '',
                endDay: (event.endDate !== undefined) ? moment(event.endDate).tz('Asia/Tokyo').add(-1, 'day').format('YYYY/MM/DD') : '',
                videoFormat: (Array.isArray(event.videoFormat)) ? event.videoFormat.map((f) => f.typeOf).join(' ') : ''
            };
        });
        res.json({
            success: true,
            count: (data.length === Number(limit))
                ? (Number(page) * Number(limit)) + 1
                : ((Number(page) - 1) * Number(limit)) + Number(data.length),
            results: results
        });
    } catch (error) {
        res.json({
            success: false,
            count: 0,
            results: error
        });
    }
}
/**
 * 一覧
 */
export async function index(req: Request, res: Response): Promise<void> {
    const placeService = new chevre.service.Place({
        endpoint: <string>process.env.API_ENDPOINT,
        auth: req.user.authClient
    });
    const searchMovieTheatersResult = await placeService.searchMovieTheaters({
        project: { ids: [req.project.id] }
    });

    res.render('events/screeningEventSeries/index', {
        movieTheaters: searchMovieTheatersResult.data
    });
}
/**
 * 作品マスタ新規登録画面検証
 */
function validate(req: Request): void {
    let colName: string = '';
    colName = '作品コード';
    req.checkBody('workPerformed.identifier', Message.Common.required.replace('$fieldName$', colName)).notEmpty();
    req.checkBody('workPerformed.identifier', Message.Common.getMaxLength(colName, NAME_MAX_LENGTH_CODE))
        .len({ max: NAME_MAX_LENGTH_CODE });
    //.regex(/^[ -\~]+$/, req.__('Message.invalid{{fieldName}}', { fieldName: '%s' })),

    colName = '作品名';
    req.checkBody('nameJa', Message.Common.required.replace('$fieldName$', colName)).notEmpty();
    req.checkBody('nameJa', Message.Common.getMaxLength(colName, NAME_MAX_LENGTH_CODE)).len({ max: NAME_MAX_LENGTH_NAME_JA });

    colName = '作品名カナ';
    req.checkBody('kanaName', Message.Common.getMaxLength(colName, NAME_MAX_LENGTH_NAME_JA)).optional()
        .len({ max: NAME_MAX_LENGTH_NAME_JA });
    // .regex(/^[ァ-ロワヲンーa-zA-Z]*$/, req.__('Message.invalid{{fieldName}}', { fieldName: '%s' })),

    colName = '上映開始日';
    req.checkBody('startDate', Message.Common.invalidDateFormat.replace('$fieldName$', colName)).isDate();

    colName = '上映終了日';
    req.checkBody('endDate', Message.Common.invalidDateFormat.replace('$fieldName$', colName)).isDate();

    colName = '上映作品サブタイトル名';
    req.checkBody('headline.ja', Message.Common.getMaxLength(colName, NAME_MAX_LENGTH_CODE))
        .len({ max: NAME_MAX_LENGTH_NAME_JA });

    colName = '集計開始曜日';
    req.checkBody('summaryStartDay', Message.Common.required.replace('$fieldName$', colName)).notEmpty();

    colName = '上映形態';
    req.checkBody('videoFormatType', Message.Common.required.replace('$fieldName$', colName)).notEmpty();
}
