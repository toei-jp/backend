/**
 * 注文ルーター
 */
import * as chevre from '@chevre/api-nodejs-client';
import * as cinerino from '@cinerino/api-nodejs-client';
import * as createDebug from 'debug';
import { Router } from 'express';
import * as moment from 'moment';
import { format } from 'util';

import { getOptions } from '../controllers/base/base.controller';
import { ApiEndpoint } from '../user';

const ordersRouter = Router();
const debug = createDebug('chevre-backend:orders');

ordersRouter.get('', async (req, res, next) => {
    const placeService = new chevre.service.Place({
        endpoint: <string>process.env.API_ENDPOINT,
        auth: req.user.authClient
    });

    try {
        const searchMovieTheatersResult = await placeService.searchMovieTheaters({
            project: { ids: [req.project.id] }
        });
        res.render('orders/index', {
            message: '',
            movieTheaters: searchMovieTheatersResult.data
        });
    } catch (err) {
        next(err);
    }
});
ordersRouter.get('/cancel', async (req, res) => {
    const options = getOptions(req, ApiEndpoint.cinerino);
    const returnOrderService = new cinerino.service.txn.ReturnOrder(options);

    try {
        const orderNumber = req.query.orderNumber;
        if (typeof orderNumber !== 'string') {
            throw new Error('OrderNumber not specified');
        }

        const transaction = await returnOrderService.start({
            // project: req.project,
            // tslint:disable-next-line:no-magic-numbers
            expires: moment().add(15, 'minutes').toDate(),
            object: {
                order: {
                    orderNumber: orderNumber
                }
            }
        });
        await returnOrderService.confirm(transaction);

        // 返品処理中の注文番号をセッション補完
        let returningOrderNumbers: string[] = [];
        const returningOrderNumbersStr = (<Express.Session>req.session).returningOrderNumbers;
        if (typeof returningOrderNumbersStr === 'string') {
            returningOrderNumbers = JSON.parse(returningOrderNumbersStr);
        }
        returningOrderNumbers.push(orderNumber);
        (<Express.Session>req.session).returningOrderNumbers = JSON.stringify(returningOrderNumbers);

        res.json({ success: true });
    } catch (error) {
        res.json({ success: false });
    }
});
// tslint:disable-next-line:max-func-body-length
ordersRouter.get('/search', async (req, res) => {
    try {
        const now = new Date();

        const options = getOptions(req, ApiEndpoint.cinerino);
        const orderService = new cinerino.service.Order(options);

        // 購入場所(customerのクライアントID識別子で判断する、どのアプリで注文されたか、ということ)
        const customerIdentifiers = [];
        switch (req.query.placeTicket) {
            case 'POS':
                customerIdentifiers.push({ name: 'clientId', value: <string>process.env.POS_CLIENT_ID });
                break;
            case 'WEB':
                customerIdentifiers.push({ name: 'clientId', value: <string>process.env.FRONTEND_CLIENT_ID });
                break;
            default:
        }

        let eventStartFrom: Date | undefined;
        let eventStartThrough: Date | undefined;
        const startDateHourFrom = req.query.startDateHourFrom ? req.query.startDateHourFrom : '00';
        const startDateMinuteFrom = req.query.startDateMinuteFrom ? req.query.startDateMinuteFrom : '00';
        const startDateHourThrough = req.query.startDateHourThrough ? req.query.startDateHourThrough : '23';
        const startDateMinuteThrough = req.query.startDateMinuteThrough ? req.query.startDateMinuteThrough : '55';
        if (req.query.startDate) {
            // tslint:disable-next-line:max-line-length
            eventStartFrom = moment(`${req.query.startDate}T${startDateHourFrom}:${startDateMinuteFrom}:00+09:00`, 'YYYY/MM/DDTHH:mm:ssZ').toDate();
            // tslint:disable-next-line:max-line-length
            eventStartThrough = moment(`${req.query.startDate}T${startDateHourThrough}:${startDateMinuteThrough}:00+09:00`, 'YYYY/MM/DDTHH:mm:ssZ').toDate();
        }

        const params: cinerino.factory.order.ISearchConditions = {
            limit: Number(req.query.limit),
            page: Number(req.query.page),
            orderDateFrom: (req.query.orderDateFrom !== undefined && req.query.orderDateFrom !== '')
                ? moment(`${req.query.orderDateFrom}T00:00:00+09:00`, 'YYYY/MM/DDTHH:mm:ssZ').toDate()
                : moment(now)
                    .add(-1, 'month')
                    .toDate(),
            orderDateThrough: (req.query.orderDateFrom !== undefined && req.query.orderDateFrom !== '')
                ? moment(`${req.query.orderDateThrough}T23:59:59+09:00`, 'YYYY/MM/DDTHH:mm:ssZ').toDate()
                : moment(now)
                    .toDate(),
            // 購入番号
            customer: {
                // 電話番号
                telephone: req.query.telephone ? req.query.telephone : undefined,
                identifiers: customerIdentifiers
            },
            confirmationNumbers: req.query.confirmationNumber ? [req.query.confirmationNumber] : undefined,
            acceptedOffers: {
                itemOffered: {
                    reservationFor: {
                        startFrom: eventStartFrom,
                        startThrough: eventStartThrough,
                        superEvent: {
                            ids: req.query.screeningEventSeriesId ? [req.query.screeningEventSeriesId] : undefined,
                            location: {
                                branchCodes: [req.query.locationBranchCode]
                            }
                        }
                    }
                }
            }
        };

        debug('searching orders...', params);
        const searchResult = await orderService.search(params);

        let returningOrderNumbers: string[] = [];
        const returningOrderNumbersStr = (<Express.Session>req.session).returningOrderNumbers;
        if (typeof returningOrderNumbersStr === 'string') {
            returningOrderNumbers = JSON.parse(returningOrderNumbersStr);
        }

        const orderCancellings: string[] = returningOrderNumbers;

        res.json({
            success: true,
            count: (searchResult.data.length === Number(params.limit))
                ? (Number(params.page) * Number(params.limit)) + 1
                : ((Number(params.page) - 1) * Number(params.limit)) + Number(searchResult.data.length),
            results: searchResult.data.map((o) => {
                return {
                    ...o,
                    paymentMethodId: o.paymentMethods.map((p) => p.paymentMethodId).join(','),
                    ticketInfo: o.acceptedOffers.map((offer) => {
                        let priceStr: string = String(offer.price);

                        if (offer.priceSpecification !== undefined) {
                            const priceSpecification = <cinerino.factory.chevre.compoundPriceSpecification.IPriceSpecification<any>>
                                offer.priceSpecification;
                            // tslint:disable-next-line:max-line-length
                            const priceComponent = <chevre.factory.priceSpecification.IPriceSpecification<chevre.factory.priceSpecificationType.UnitPriceSpecification> | undefined>
                                priceSpecification.priceComponent.find(
                                    (c) => (<any>c).typeOf === chevre.factory.priceSpecificationType.UnitPriceSpecification
                                );
                            if (priceComponent !== undefined) {
                                // 単価仕様をテキスト表現
                                priceStr = format(
                                    `%s(%s枚)円`,
                                    priceComponent.price,
                                    priceComponent.referenceQuantity.value
                                );
                            }
                        }

                        return format(
                            '%s / %s / %s',
                            (offer.itemOffered.typeOf === cinerino.factory.chevre.reservationType.EventReservation
                                && offer.itemOffered.reservedTicket.ticketedSeat !== undefined)
                                ? offer.itemOffered.reservedTicket.ticketedSeat.seatNumber
                                : '座席指定なし',
                            (offer.itemOffered.typeOf === cinerino.factory.chevre.reservationType.EventReservation)
                                ? offer.itemOffered.reservedTicket.ticketType.name.ja
                                : '',
                            priceStr
                        );
                    }).join('<br>')
                };
            }),
            orderCancellings: orderCancellings
        });
    } catch (err) {
        debug(err);
        res.json({
            success: false,
            count: 0,
            results: [],
            message: err.message
        });
    }
});
export default ordersRouter;
