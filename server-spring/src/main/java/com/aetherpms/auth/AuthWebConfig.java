package com.aetherpms.auth;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** 0031 — 인증→RBAC 인터셉터 등록(순서: 신원 세팅 후 인가). */
@Configuration
public class AuthWebConfig implements WebMvcConfigurer {

    private final AuthInterceptor authInterceptor;
    private final RbacInterceptor rbacInterceptor;

    public AuthWebConfig(AuthInterceptor authInterceptor, RbacInterceptor rbacInterceptor) {
        this.authInterceptor = authInterceptor;
        this.rbacInterceptor = rbacInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(authInterceptor).addPathPatterns("/api/**").order(1);
        registry.addInterceptor(rbacInterceptor).addPathPatterns("/api/**").order(2);
    }
}
