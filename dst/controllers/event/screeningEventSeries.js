"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 上映イベントシリーズコントローラー
 */
const chevre = require("@chevre/api-nodejs-client");
const createDebug = require("debug");
const http_status_1 = require("http-status");
const moment = require("moment-timezone");
const _ = require("underscore");
const Message = require("../../common/Const/Message");
const debug = createDebug('chevre-backend:controllers');
// 1ページに表示するデータ数
// const DEFAULT_LINES: number = 10;
// 作品コード 半角64
const NAME_MAX_LENGTH_CODE = 64;
// 作品名・日本語 全角64
const NAME_MAX_LENGTH_NAME_JA = 64;
/**
 * 新規登録
 */
function add(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const creativeWorkService = new chevre.service.CreativeWork({
            endpoint: process.env.API_ENDPOINT,
            auth: req.user.authClient
        });
        const eventService = new chevre.service.Event({
            endpoint: process.env.API_ENDPOINT,
            auth: req.user.authClient
        });
        const placeService = new chevre.service.Place({
            endpoint: process.env.API_ENDPOINT,
            auth: req.user.authClient
        });
        const searchMoviesResult = yield creativeWorkService.searchMovies({
            sort: {
                datePublished: chevre.factory.sortType.Descending
            },
            project: { ids: [req.project.id] },
            offers: {
                availableFrom: new Date()
            }
        });
        const movies = searchMoviesResult.data;
        const searchMovieTheatersResult = yield placeService.searchMovieTheaters({
            project: { ids: [req.project.id] }
        });
        let message = '';
        let errors = {};
        if (req.method === 'POST') {
            // バリデーション
            validate(req);
            const validatorResult = yield req.getValidationResult();
            errors = req.validationErrors(true);
            if (validatorResult.isEmpty()) {
                // 作品DB登録
                try {
                    const searchResult = yield creativeWorkService.searchMovies({
                        project: { ids: [req.project.id] },
                        identifier: req.body.workPerformed.identifier
                    });
                    const movie = searchResult.data.shift();
                    if (movie === undefined) {
                        throw new Error(`Movie ${req.query.identifier} Not Found`);
                    }
                    const movieTheater = yield placeService.findMovieTheaterById({ id: req.body.locationId });
                    req.body.contentRating = movie.contentRating;
                    const attributes = createEventFromBody(req, movie, movieTheater, true);
                    debug('saving an event...', attributes);
                    const events = yield eventService.create(attributes);
                    req.flash('message', '登録しました');
                    res.redirect(`/events/screeningEventSeries/${events[0].id}/update`);
                    return;
                }
                catch (error) {
                    message = error.message;
                }
            }
            else {
                message = '入力に誤りがあります';
            }
        }
        const forms = Object.assign({ headline: {}, workPerformed: {}, videoFormatType: [] }, req.body);
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
    });
}
exports.add = add;
/**
 * 編集
 */
// tslint:disable-next-line:cyclomatic-complexity max-func-body-length
function update(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const creativeWorkService = new chevre.service.CreativeWork({
            endpoint: process.env.API_ENDPOINT,
            auth: req.user.authClient
        });
        const eventService = new chevre.service.Event({
            endpoint: process.env.API_ENDPOINT,
            auth: req.user.authClient
        });
        const placeService = new chevre.service.Place({
            endpoint: process.env.API_ENDPOINT,
            auth: req.user.authClient
        });
        const searchMoviesResult = yield creativeWorkService.searchMovies({
            sort: {
                datePublished: chevre.factory.sortType.Descending
            },
            project: { ids: [req.project.id] },
            offers: {
                availableFrom: new Date()
            }
        });
        const searchMovieTheatersResult = yield placeService.searchMovieTheaters({
            project: { ids: [req.project.id] }
        });
        let message = '';
        let errors = {};
        const eventId = req.params.eventId;
        const event = yield eventService.findById({
            id: eventId
        });
        if (req.method === 'POST') {
            // バリデーション
            validate(req);
            const validatorResult = yield req.getValidationResult();
            errors = req.validationErrors(true);
            if (validatorResult.isEmpty()) {
                // 作品DB登録
                try {
                    const searchResult = yield creativeWorkService.searchMovies({
                        project: { ids: [req.project.id] },
                        identifier: req.body.workPerformed.identifier
                    });
                    const movie = searchResult.data.shift();
                    if (movie === undefined) {
                        throw new Error(`Movie ${req.query.identifier} Not Found`);
                    }
                    const movieTheater = yield placeService.findMovieTheaterById({ id: req.body.locationId });
                    req.body.contentRating = movie.contentRating;
                    const attributes = createEventFromBody(req, movie, movieTheater, false);
                    debug('saving an event...', attributes);
                    yield eventService.update({
                        id: eventId,
                        attributes: attributes
                    });
                    req.flash('message', '更新しました');
                    res.redirect(req.originalUrl);
                    return;
                }
                catch (error) {
                    message = error.message;
                }
            }
            else {
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
        const forms = Object.assign(Object.assign(Object.assign(Object.assign({ headline: {} }, event), { signageDisplayName: (signageDisplayName !== undefined) ? signageDisplayName.value : '', signageDislaySubtitleName: (signageDislaySubtitleName !== undefined) ? signageDislaySubtitleName.value : '', summaryStartDay: (summaryStartDay !== undefined) ? summaryStartDay.value : '' }), req.body), { nameJa: (_.isEmpty(req.body.nameJa)) ? event.name.ja : req.body.nameJa, nameEn: (_.isEmpty(req.body.nameEn)) ? event.name.en : req.body.nameEn, duration: (_.isEmpty(req.body.duration)) ? moment.duration(event.duration).asMinutes() : req.body.duration, locationId: event.location.id, translationType: translationType, videoFormatType: (Array.isArray(event.videoFormat)) ? event.videoFormat.map((f) => f.typeOf) : [], startDate: (_.isEmpty(req.body.startDate)) ?
                (event.startDate !== null) ? moment(event.startDate).tz('Asia/Tokyo').format('YYYY/MM/DD') : '' :
                req.body.startDate, endDate: (_.isEmpty(req.body.endDate)) ?
                (event.endDate !== null) ? moment(event.endDate).tz('Asia/Tokyo').add(-1, 'day').format('YYYY/MM/DD') : '' :
                req.body.endDate, mvtkFlg: (_.isEmpty(req.body.mvtkFlg)) ? mvtkFlg : req.body.mvtkFlg });
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
    });
}
exports.update = update;
/**
 * 作品 - レイティング
 */
function getRating(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const creativeWorkService = new chevre.service.CreativeWork({
                endpoint: process.env.API_ENDPOINT,
                auth: req.user.authClient
            });
            const searchResult = yield creativeWorkService.searchMovies({
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
        }
        catch (error) {
            res.json({
                success: false,
                count: 0,
                results: []
            });
        }
    });
}
exports.getRating = getRating;
/**
 * リクエストボディからイベントオブジェクトを作成する
 */
// tslint:disable-next-line:max-func-body-length
function createEventFromBody(req, movie, movieTheater, isNew) {
    const body = req.body;
    const videoFormat = (Array.isArray(body.videoFormatType)) ? body.videoFormatType.map((f) => {
        return { typeOf: f, name: f };
    }) : [];
    const soundFormat = (Array.isArray(body.soundFormatType)) ? body.soundFormatType.map((f) => {
        return { typeOf: f, name: f };
    }) : [];
    let acceptedPaymentMethod;
    // ムビチケ除外の場合は対応決済方法を追加
    Object.keys(chevre.factory.paymentMethodType).forEach((key) => {
        if (acceptedPaymentMethod === undefined) {
            acceptedPaymentMethod = [];
        }
        const paymentMethodType = chevre.factory.paymentMethodType[key];
        if (body.mvtkFlg !== '1' && paymentMethodType === chevre.factory.paymentMethodType.MovieTicket) {
            return;
        }
        acceptedPaymentMethod.push(paymentMethodType);
    });
    const offers = {
        project: { typeOf: req.project.typeOf, id: req.project.id },
        typeOf: chevre.factory.offerType.Offer,
        priceCurrency: chevre.factory.priceCurrency.JPY,
        acceptedPaymentMethod: acceptedPaymentMethod
    };
    let subtitleLanguage;
    if (body.translationType === '0') {
        subtitleLanguage = { typeOf: 'Language', name: 'Japanese' };
    }
    let dubLanguage;
    if (body.translationType === '1') {
        dubLanguage = { typeOf: 'Language', name: 'Japanese' };
    }
    if (typeof movie.duration !== 'string') {
        throw new Error('作品の上映時間が未登録です');
    }
    return Object.assign(Object.assign(Object.assign({ project: req.project, typeOf: chevre.factory.eventType.ScreeningEventSeries, name: {
            ja: body.nameJa,
            en: body.nameEn,
            kr: ''
        }, kanaName: body.kanaName, location: {
            project: req.project,
            id: movieTheater.id,
            typeOf: movieTheater.typeOf,
            branchCode: movieTheater.branchCode,
            name: movieTheater.name,
            kanaName: movieTheater.kanaName
        }, 
        // organizer: {
        //     typeOf: OrganizationType.MovieTheater,
        //     identifier: params.movieTheater.identifier,
        //     name: params.movieTheater.name
        // },
        videoFormat: videoFormat, soundFormat: soundFormat, workPerformed: movie, duration: movie.duration, startDate: (!_.isEmpty(body.startDate)) ? moment(`${body.startDate}T00:00:00+09:00`, 'YYYY/MM/DDTHH:mm:ssZ').toDate() : undefined, endDate: (!_.isEmpty(body.endDate))
            ? moment(`${body.endDate}T00:00:00+09:00`, 'YYYY/MM/DDTHH:mm:ssZ').add(1, 'day').toDate()
            : undefined, eventStatus: chevre.factory.eventStatusType.EventScheduled, headline: {
            ja: body.headline.ja,
            en: ''
        }, additionalProperty: [
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
        ], offers: offers, description: {
            ja: body.description,
            en: '',
            kr: ''
        } }, (subtitleLanguage !== undefined) ? { subtitleLanguage } : undefined), (dubLanguage !== undefined) ? { dubLanguage } : undefined), (!isNew)
        ? {
            $unset: Object.assign(Object.assign({}, (subtitleLanguage === undefined) ? { subtitleLanguage: 1 } : undefined), (dubLanguage === undefined) ? { dubLanguage: 1 } : undefined)
        }
        : undefined);
}
/**
 * 検索API
 */
function search(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const eventService = new chevre.service.Event({
                endpoint: process.env.API_ENDPOINT,
                auth: req.user.authClient
            });
            const branchCode = req.query.branchCode;
            const fromDate = req.query.fromDate;
            const toDate = req.query.toDate;
            if (branchCode === undefined) {
                throw new Error();
            }
            // 上映終了して「いない」劇場上映作品を検索
            const limit = 100;
            const page = 1;
            const { data } = yield eventService.search({
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
                return Object.assign(Object.assign({}, event), { id: event.id, filmNameJa: event.name.ja, filmNameEn: event.name.en, kanaName: event.kanaName, duration: moment.duration(event.duration).humanize(), contentRating: event.workPerformed.contentRating, translationType: translationType, videoFormat: event.videoFormat, mvtkFlg: mvtkFlg });
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
        }
        catch (_) {
            res.json({
                success: false,
                count: 0,
                results: []
            });
        }
    });
}
exports.search = search;
/**
 * 劇場作品のスケジュール検索
 */
function searchScreeningEvents(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const eventService = new chevre.service.Event({
                endpoint: process.env.API_ENDPOINT,
                auth: req.user.authClient
            });
            const searchScreeningEventsResult = yield eventService.search(Object.assign(Object.assign({}, req.query), { project: { ids: [req.project.id] }, typeOf: chevre.factory.eventType.ScreeningEvent, superEvent: { ids: [req.params.eventId] } }));
            res.json(searchScreeningEventsResult);
        }
        catch (error) {
            res.status(http_status_1.INTERNAL_SERVER_ERROR).json({ error: { message: error.message } });
        }
    });
}
exports.searchScreeningEvents = searchScreeningEvents;
/**
 * 一覧データ取得API
 */
function getList(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const eventService = new chevre.service.Event({
                endpoint: process.env.API_ENDPOINT,
                auth: req.user.authClient
            });
            const limit = Number(req.query.limit);
            const page = Number(req.query.page);
            const { data } = yield eventService.search({
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
                return Object.assign(Object.assign({}, event), { translationType: translationType, startDay: (event.startDate !== undefined) ? moment(event.startDate).tz('Asia/Tokyo').format('YYYY/MM/DD') : '', endDay: (event.endDate !== undefined) ? moment(event.endDate).tz('Asia/Tokyo').add(-1, 'day').format('YYYY/MM/DD') : '', videoFormat: (Array.isArray(event.videoFormat)) ? event.videoFormat.map((f) => f.typeOf).join(' ') : '' });
            });
            res.json({
                success: true,
                count: (data.length === Number(limit))
                    ? (Number(page) * Number(limit)) + 1
                    : ((Number(page) - 1) * Number(limit)) + Number(data.length),
                results: results
            });
        }
        catch (error) {
            res.json({
                success: false,
                count: 0,
                results: error
            });
        }
    });
}
exports.getList = getList;
/**
 * 一覧
 */
function index(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const placeService = new chevre.service.Place({
            endpoint: process.env.API_ENDPOINT,
            auth: req.user.authClient
        });
        const searchMovieTheatersResult = yield placeService.searchMovieTheaters({
            project: { ids: [req.project.id] }
        });
        res.render('events/screeningEventSeries/index', {
            movieTheaters: searchMovieTheatersResult.data
        });
    });
}
exports.index = index;
/**
 * 作品マスタ新規登録画面検証
 */
function validate(req) {
    let colName = '';
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
