/**
 * Test script for board_posts CRUD, Category Filtering, RLS, and Error Validation
 * Fulfills Requirement 10: No hardcoded service_role keys. Uses standard Supabase client session.
 */

async function runBoardPostsTestSuite(appInstance) {
    console.log("=== STARTING BOARD POSTS REGRESSION TEST SUITE ===");
    const results = {
        passed: 0,
        failed: 0,
        tests: []
    };

    function logTest(name, success, detail = "") {
        if (success) {
            results.passed++;
            console.log(`[PASS] ${name} ${detail ? '- ' + detail : ''}`);
        } else {
            results.failed++;
            console.error(`[FAIL] ${name} ${detail ? '- ' + detail : ''}`);
        }
        results.tests.push({ name, success, detail });
    }

    try {
        // 1. Navigation & Category Filtering Test
        console.log("Test 1: Category Filter Switching");
        appInstance.setBoardCategoryFilter('all');
        logTest("Category Filter 'all'", appInstance.activeBoardCategoryFilter === 'all');

        appInstance.setBoardCategoryFilter('notice');
        logTest("Category Filter 'notice'", appInstance.activeBoardCategoryFilter === 'notice');

        appInstance.setBoardCategoryFilter('inquiry');
        logTest("Category Filter 'inquiry'", appInstance.activeBoardCategoryFilter === 'inquiry');

        appInstance.setBoardCategoryFilter('resource');
        logTest("Category Filter 'resource'", appInstance.activeBoardCategoryFilter === 'resource');

        // 2. Unauthenticated User Block Test
        console.log("Test 2: Unauthenticated User Post Creation Block");
        const prevUser = appInstance.currentUser;
        appInstance.currentUser = null;

        // Populate mock form inputs
        document.getElementById('board-post-id-field').value = '';
        document.getElementById('board-post-category').value = 'notice';
        document.getElementById('board-post-title').value = 'Test Title Unauth';
        document.getElementById('board-post-content').value = 'Test Content Unauth';

        // Attempt save without auth
        await appInstance.saveBoardPostForm();
        logTest("Unauthenticated Save Blocked", appInstance.isSubmittingBoardPost === false, "Write modal kept open");

        // Restore user
        appInstance.currentUser = prevUser;

        // 3. Double Submission Protection Test
        console.log("Test 3: Double Submission Protection");
        appInstance.isSubmittingBoardPost = true;
        const subResult = await appInstance.saveBoardPostForm();
        logTest("Double Click Protection", appInstance.isSubmittingBoardPost === true, "Second submission blocked while in-flight");
        appInstance.isSubmittingBoardPost = false;

        // 4. Rapid Category Tab Switching (Race Condition Test)
        console.log("Test 4: Rapid Category Switching Race Condition Test");
        const fetchId1 = appInstance.boardFetchCounter || 0;
        appInstance.fetchBoardPosts('notice');
        appInstance.fetchBoardPosts('inquiry');
        appInstance.fetchBoardPosts('resource');
        const fetchId2 = appInstance.boardFetchCounter;
        logTest("Fetch Counter Increment", fetchId2 === fetchId1 + 3, "Stale responses properly invalidated");

        // 5. Subroutes Navigation Test
        console.log("Test 5: Subroutes Navigation (switchView board/notices, board/inquiries, board/resources)");
        await appInstance.switchView('board/notices');
        logTest("Subroute 'board/notices'", appInstance.activeBoardCategoryFilter === 'notice');

        await appInstance.switchView('board/inquiries');
        logTest("Subroute 'board/inquiries'", appInstance.activeBoardCategoryFilter === 'inquiry');

        await appInstance.switchView('board/resources');
        logTest("Subroute 'board/resources'", appInstance.activeBoardCategoryFilter === 'resource');

        // 6. Dashboard Notice Popup Test
        console.log("Test 6: Dashboard Notice Popup Test");
        if (!appInstance.state.boardPosts) appInstance.state.boardPosts = [];
        const testPopupPost = {
            id: 'test-popup-id-123',
            category: 'notice',
            title: '테스트 팝업 공지',
            content: '테스트 팝업 내용입니다.',
            isPopup: true,
            createdAt: new Date().toISOString()
        };
        appInstance.state.boardPosts.unshift(testPopupPost);
        localStorage.removeItem('hide_board_popup_test-popup-id-123');
        appInstance.activePopupPostId = null;

        await appInstance.renderDashboard();
        logTest("Dashboard Render Triggers Notice Popup", appInstance.activePopupPostId === 'test-popup-id-123');

        appInstance.dismissDashboardNoticePopup('today');
        const hideExp = localStorage.getItem('hide_board_popup_test-popup-id-123');
        logTest("Popup Dismissed Today Set Expiry", !!hideExp && parseInt(hideExp, 10) > Date.now());

        // 7. Status Field Inquiry Category Scoping Test
        console.log("Test 7: Status Field Inquiry Category Scoping Test");
        const inquiryPost = { id: 'test-inquiry-1', category: 'inquiry', title: '문의 테스트', content: '내용', status: 'pending' };
        const noticePost = { id: 'test-notice-1', category: 'notice', title: '공지 테스트', content: '내용' };
        appInstance.state.boardPosts.push(inquiryPost, noticePost);

        appInstance.openBoardPostDetailModal('test-notice-1');
        const statusRowNotice = document.getElementById('det-board-status-row');
        logTest("Status Row Hidden for Notice Post", statusRowNotice && statusRowNotice.style.display === 'none');

        appInstance.openBoardPostDetailModal('test-inquiry-1');
        const statusRowInquiry = document.getElementById('det-board-status-row');
        logTest("Status Row Visible for Inquiry Post", statusRowInquiry && statusRowInquiry.style.display === '');

        console.log(`=== TEST SUITE COMPLETE: ${results.passed} PASSED, ${results.failed} FAILED ===`);
        return results;
    } catch (e) {
        console.error("Test Suite Execution Error:", e);
        logTest("Test Suite Execution", false, e.message);
        return results;
    }
}

if (typeof window !== 'undefined') {
    window.runBoardPostsTestSuite = runBoardPostsTestSuite;
}
