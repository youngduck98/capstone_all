const express = require('express');
const { isLoggedIn, isNotLoggedIn } = require('./middlewares');
const { User, WorkSpace, Chat } = require('../models');
const db = require('../models/index');

const router = express.Router();
const WorkSpaceGroup = db.sequelize.models.WorkSpaceGroup;

// workspace 생성
router.post('/new', isLoggedIn, async (req, res, next) => {
    try{
        const newWorkSpace = await WorkSpace.create({
            userId: req.user.id,
            status: 'host',
        });
        // workspace_group도 같이생성
        await WorkSpaceGroup.create({
            hostWorkSpaceId: newWorkSpace.id,
            subWorkSpaceId: newWorkSpace.id,
            hostUserId: req.user.id,
            subUserId: req.user.id,
        });
        res.redirect('/');
    } catch(error){
        console.error(error);
        next(error);
    }
});

// workspace 입장, 호스트의 워크스페이스만 입장 가능
router.get('/:hostWorkSpaceId', isLoggedIn, async(req, res, next) => {
    try{
        // 입장하려는 호스트의 워크스페이스가 존재하는지 탐색
        const exHostWorkSpace = await WorkSpace.findOne({
            where: {
                id: req.params.hostWorkSpaceId,
                status: 'host',
            }
        });
        if(!exHostWorkSpace){
            return res.status(404).send('존재하지 않는 workspace');
        }

        // 자신이 호스트의 워크스페이스와 연결돼있는지 확인
        const exWorkSpace = await WorkSpaceGroup.findOne({
            where : {
                hostWorkSpaceId: req.params.hostWorkSpaceId,
                subUserId: req.user.id,
            },
        });

        // 자신이 호스트의 워크스페이스와 연결이 안돼있는 경우
        if(!exWorkSpace) {
            // subworkspace 생성
            const newSubWorkSpace = await WorkSpace.create({
                userId: req.user.id,
                status: 'sub',
            });
            // 호스트의 워크스페이스와 자신의 서브 워크스페이스를 연결
            await WorkSpaceGroup.create({
                hostWorkSpaceId: req.params.hostWorkSpaceId,
                subWorkSpaceId: newSubWorkSpace.id,
                hostUserId: exHostWorkSpace.userId,
                subUserId: req.user.id,
            });
            req.session.subWorkSpaceId = newSubWorkSpace.id; // 자신의 워크스페이스를 세션에 저장
            req.session.userNick = req.user.nick;
        }
        else{
            req.session.subWorkSpaceId = exWorkSpace.subWorkSpaceId; // 자신의 워크스페이스를 세션에 저장
            req.session.userNick = req.user.nick;
        }
        const workSpaceGroups = await WorkSpaceGroup.findAll({
            where: {
                hostWorkSpaceId: req.params.hostWorkSpaceId,
            }
        });

        // 이전 채팅 불러오기
        const chats = await Chat.findAll({
            where: {
                hostWorkSpaceId: req.params.hostWorkSpaceId
            }
        });

        if(exWorkSpace){
            req.app.get('io').to(req.params.hostWorkSpaceId).emit('join_ex',{
                chat: `${req.user.nick}님 입장`,
            });
        }
        else{
            const newSubWorkSpace = await WorkSpaceGroup.findOne({
                where:{
                    hostWorkSpaceId: req.params.hostWorkSpaceId,
                    subUserId: req.user.id
                }
            });
            req.app.get('io').to(req.params.hostWorkSpaceId).emit('join_new',{
                chat: `${req.user.nick}님 입장`,
                workspace: newSubWorkSpace,
            });
        }
        res.render('workspace', {workSpaceGroups, chats});
    } catch(error){
        console.error(error);
        next(error);
    }
});


// 채팅입력시
router.post('/:hostWorkSpaceId/chat', async (req, res, next) => {
    console.log("getdata");
    try {
        const findNickFor = await User.findOne({
            where: {
                id: req.user.id,
            }
        });
        const chat = await Chat.create({
            userId: req.user.id,
            nick: findNickFor.nick,
            hostWorkSpaceId: req.params.hostWorkSpaceId,
            chat: req.body.chat,
        });
        req.app.get('io').to(req.params.hostWorkSpaceId).emit('chat', chat);
        res.send('ok');
    } catch (error) {
        console.error(error);
        next(error);
    }
});

router.post('/:hostWorkSpaceId/change/snapshot', async (req, res, next) => {
    //http://localhost:8002/workspace/3/change/snapshot 
    console.log("getdata");
    try{
        await WorkSpace.update({
            snapshot: req.body.snapshot,
        },{
            where:{
                id: req.session.subWorkSpaceId,
            }
        });
        const changeWorkSpace = await WorkSpace.findOne({
            where:{
                id: req.session.subWorkSpaceId,
            }
        })

        console.log(req.session.subWorkSpaceId,'의 snapshot이 변경됐습니다');
        req.app.get('io').to(req.params.hostWorkSpaceId).emit('changeSnapshot', changeWorkSpace);

    } catch(error){
        console.error(error);
        next(error);
    }
});

module.exports = router;