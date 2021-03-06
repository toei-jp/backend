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
 * 劇場ルーター
 */
const chevre = require("@chevre/api-nodejs-client");
const express_1 = require("express");
const movieTheaterRouter = express_1.Router();
movieTheaterRouter.get('', (_, res) => {
    res.render('places/movieTheater/index', {
        message: ''
    });
});
movieTheaterRouter.get('/search', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const placeService = new chevre.service.Place({
            endpoint: process.env.API_ENDPOINT,
            auth: req.user.authClient
        });
        const limit = Number(req.query.limit);
        const page = Number(req.query.page);
        const { data } = yield placeService.searchMovieTheaters({
            limit: limit,
            page: page,
            project: { ids: [req.project.id] },
            name: req.query.name
        });
        const results = data.map((movieTheater) => {
            const availabilityEndsGraceTimeInMinutes = (movieTheater.offers !== undefined
                && movieTheater.offers.availabilityEndsGraceTime !== undefined
                && movieTheater.offers.availabilityEndsGraceTime.value !== undefined)
                // tslint:disable-next-line:no-magic-numbers
                ? Math.floor(movieTheater.offers.availabilityEndsGraceTime.value / 60)
                : undefined;
            return Object.assign(Object.assign({}, movieTheater), { availabilityStartsGraceTimeInDays: (movieTheater.offers !== undefined
                    && movieTheater.offers.availabilityStartsGraceTime !== undefined
                    && movieTheater.offers.availabilityStartsGraceTime.value !== undefined)
                    // tslint:disable-next-line:no-magic-numbers
                    ? -movieTheater.offers.availabilityStartsGraceTime.value
                    : undefined, availabilityEndsGraceTimeInMinutes: (availabilityEndsGraceTimeInMinutes !== undefined)
                    ? (availabilityEndsGraceTimeInMinutes >= 0)
                        ? `${availabilityEndsGraceTimeInMinutes}分後`
                        : `${-availabilityEndsGraceTimeInMinutes}分前`
                    : undefined });
        });
        res.json({
            success: true,
            count: (data.length === Number(limit))
                ? (Number(page) * Number(limit)) + 1
                : ((Number(page) - 1) * Number(limit)) + Number(data.length),
            results: results
        });
    }
    catch (err) {
        res.json({
            success: false,
            count: 0,
            results: []
        });
    }
}));
movieTheaterRouter.get('/getScreenListByTheaterBranchCode', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const branchCode = req.query.branchCode;
        const placeService = new chevre.service.Place({
            endpoint: process.env.API_ENDPOINT,
            auth: req.user.authClient
        });
        const searchMovieTheatersResult = yield placeService.searchMovieTheaters({
            project: { ids: [req.project.id] },
            branchCodes: [branchCode]
        });
        const movieTheaterWithoutScreeningRoom = searchMovieTheatersResult.data.shift();
        if (movieTheaterWithoutScreeningRoom === undefined) {
            throw new Error(`Movie Theater ${branchCode} Not Found`);
        }
        const place = yield placeService.findMovieTheaterById({ id: movieTheaterWithoutScreeningRoom.id });
        const results = place.containsPlace.map((screen) => ({
            branchCode: screen.branchCode,
            name: (screen.name !== undefined) ? screen.name.ja : ''
        }));
        results.sort((screen1, screen2) => {
            if (screen1.name > screen2.name) {
                return 1;
            }
            if (screen1.name < screen2.name) {
                return -1;
            }
            return 0;
        });
        res.json({
            success: true,
            results
        });
    }
    catch (err) {
        res.json({
            success: false,
            results: []
        });
    }
}));
exports.default = movieTheaterRouter;
